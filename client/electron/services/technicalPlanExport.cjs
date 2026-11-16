const { exportGeneratedOutlineTitle } = require('../utils/generatedOutlineTitle.cjs');
const { localizeExportFormat } = require('../utils/localizeExportFormat.cjs');
const { normalizeSaviaMarkup } = require('../utils/saviaMarkup.cjs');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const AdmZip = require('adm-zip');
const { CONTENT_GENERATION_AGENT_TASK_KEY } = require('./contentGenerationAgent.cjs');
const { collectOutlineExportEntries, getPendingContentModeMessage, renderMarkdownForRestrictedHtml } = require('./exportService.cjs');
const { findHtmlStructureIssues } = require('../utils/htmlStructure.cjs');
const { normalizePendingMarkers } = require('../utils/pendingMarkers.cjs');

/** Escape program-inserted project names, outline headings, and placeholders. */
function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function templateChapterIds(bytes) {
  try {
    const xml = new AdmZip(bytes).readAsText('word/document.xml');
    const $ = cheerio.load(xml, { xmlMode: true });
    return $('*').toArray().flatMap(element => {
      if (element.name.split(':').at(-1) !== 'bookmarkStart') return [];
      const name = Object.entries(element.attribs).find(([key]) => key.split(':').at(-1) === 'name')?.[1] || '';
      const match = /^savia_c_([0-9a-f]{32})$/i.exec(name);
      return match ? [match[1].toLowerCase()] : [];
    });
  } catch { return []; }
}

/** Read AI section content; return original HTML even when images are unready for pre-export source inspection. */
function readAiSection(workspaceDir, file) {
  if (!workspaceDir) return { reason: '正文未生成', detail: `正文 Agent 工作区不存在，无法读取 ${file}` };
  let body;
  try {
    body = normalizeSaviaMarkup(fs.readFileSync(path.join(workspaceDir, file), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { reason: '正文未生成', detail: `正文文件不存在：${file}` };
    throw error;
  }
  if (!body.trim()) return { body, reason: '正文未生成', detail: `正文文件为空：${file}` };
  const $ = cheerio.load(body, null, false);
  for (const img of $('img').toArray()) {
    const reference = $(img).attr('data-sv-asset-ref');
    if (!reference) return { body, reason: '有图片未生成完成', detail: '图片缺少 data-sv-asset-ref' };
    try {
      fs.accessSync(path.join(workspaceDir, reference));
    } catch (error) {
      if (error.code === 'ENOENT') return { body, reason: '有图片未生成完成', detail: `图片文件不存在：${reference}` };
      throw error;
    }
  }
  return { body, $ };
}

/** AI leaf content files use stable IDs as filenames. */
function aiSectionFile(item) {
  return `正文/${encodeURIComponent(item.id)}.html`;
}

/** Full-document export reads current artifacts and sends inspection issues to the existing content task for repair. */
function createTechnicalPlanExport({ technicalPlanStore, templateStore, agentService, openXmlHelperService, startContentGeneration }) {
  return {
    /**
     * Save dialogs and conversion use the outline/template from the same click.
     * Template-settings export tests supply the edited configuration instead of the project's selected template.
     */
    prepare({ exportFormat } = {}) {
      const state = technicalPlanStore.loadTechnicalPlan();
      if (!state.outlineData?.outline?.length) throw new Error('没有可导出的目录内容');
      const template = exportFormat ? null : templateStore.getTemplate(state.exportTemplateId);
      if (!exportFormat && !template) throw new Error('请先到“长嘛样”选择有效的导出模板');
      const task = agentService.loadPersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY);
      const bidTemplate = technicalPlanStore.hasBidTemplate?.() ? fs.readFileSync(technicalPlanStore.getBidTemplatePath()) : null;
      return {
        project_name: state.outlineData.project_name,
        outline: state.outlineData.outline,
        export_format: exportFormat || template.config,
        export_template_scope: state.exportTemplateScope,
        workspaceDir: task?.paths.workspaceDir,
        bidTemplate,
        bidTemplateChapterIds: bidTemplate ? templateChapterIds(bidTemplate) : [],
      };
    },

    /** Inspect original HTML section by section before export, aggregating structural issues and stable file locations. */
    inspect(snapshot) {
      const issues = [];
      for (const { item } of collectOutlineExportEntries(snapshot.outline, snapshot.export_template_scope === 'ai-only')) {
        if (item.children?.length || item.content_mode !== 'ai-generate') continue;
        const file = aiSectionFile(item);
        const section = readAiSection(snapshot.workspaceDir, file);
        if (section.body === undefined) continue;
        const problems = findHtmlStructureIssues(section.body, { checkSourceCompleteness: true });
        if (problems.length) issues.push({ id: item.id, section: `${item.number} ${item.title}`, file, problems });
      }
      return issues;
    },

    /** Send current issues as result requirements to the original content task; do not repair in the export service. */
    repair(issues) {
      const requirement = '导出前检查发现以下小节存在问题。请结合已有会话上下文、项目资料和受限 HTML 规范完成修复，使这些小节具备完整正文、有效图片引用和符合规范的 HTML，能够用于 Word 导出。\n\n'
        + issues.map(issue => `${issue.section}\n稳定 ID：${issue.id}\nHTML 文件：${issue.file}\n检查问题：\n${issue.problems.map(problem => `- ${problem}`).join('\n')}`).join('\n\n');
      return startContentGeneration({ exportRepair: requirement });
    },

    /**
     * Assemble prechecked original HTML in current outline order and apply a shared template; layout self-check retains strict validation.
     * Replace individual unexportable images with text in place and record section warnings without interrupting export.
     */
    async build(snapshot, { onProgress, stats, developerLogger, layoutCheck = false, locale = 'zh' }) {
      const msg = (zh, es) => locale === 'es' ? es : zh;
      const entries = collectOutlineExportEntries(snapshot.outline, snapshot.export_template_scope === 'ai-only');
      const assets = new Map();
      const ranges = [];
      const layoutSources = [];
      const warnings = [];
      const templateChapterIds = [];
      const availableTemplateIds = new Set((snapshot.bidTemplateChapterIds || []).map(id => id.replaceAll('-', '').toLowerCase()));
      let missingTemplateCount = 0;
      let skippedCount = 0;
      // Track image-reference section ownership and export failure reasons, then aggregate section notices after conversion.
      const imageSections = new Map();
      const imageFailures = new Map();
      const recordImages = (label, references) => {
        for (const reference of references) imageSections.set(reference, new Set(imageSections.get(reference)).add(label));
      };
      const recordImageFailure = (label, reason) => imageFailures.set(label, [...(imageFailures.get(label) || []), reason]);
      // Only self-check copies include location markers, which the converter replaces with invisible bookmarks.
      const mark = (html, source) => {
        const name = `yb_layout_${layoutSources.length}`;
        layoutSources.push({ name, ...source });
        return `<p>SAVIALAYOUT:${name}</p>\n${html}`;
      };
      // Merge adjacent identical style scopes and format complete chapters once; mixed parent headings follow their first child's page.
      const append = (html, useTemplate, sectionTemplate) => {
        html = normalizeSaviaMarkup(html);
        const previous = ranges.at(-1);
        if (previous?.useTemplate === useTemplate && previous.sectionTemplate === sectionTemplate) previous.html += `\n${html}`;
        else ranges.push({ html, useTemplate, sectionTemplate });
      };
      append(`<p style="text-align:center"><em>${msg('内容由 AI 生成', 'Contenido generado con IA')}</em></p><p style="text-align:center"><strong>${escapeHtml(snapshot.project_name || msg('投标技术文件', 'Oferta técnica'))}</strong></p>`,
        snapshot.export_template_scope !== 'ai-only', entries[0].sectionTemplate);
      for (const [index, entry] of entries.entries()) {
        const { item, level, useTemplate, sectionTemplate } = entry;
        const isTemplateLeaf = !item.children?.length && item.content_mode === 'template-fill';
        const includeTemplate = isTemplateLeaf && snapshot.bidTemplate && availableTemplateIds.has(item.id.replaceAll('-', '').toLowerCase());
        if (isTemplateLeaf && snapshot.bidTemplate && !includeTemplate) {
          missingTemplateCount += 1;
          warnings.push(locale === 'es' ? `No se incorporó la plantilla de ${item.title}; vuelve a extraer sus capítulos y revisa el documento.` : locale === 'en' ? `The template for ${item.title} was not included; extract its chapters again and review the document.` : `未合并章节 ${item.title} 的模板，请重新提取并检查文档。`);
        }
        if (level > 6) throw new Error('当前转换器最多支持六级章节标题');
        const headingStyle = useTemplate ? snapshot.export_format?.headings?.[Math.min(level - 1, 5)] : undefined;
        const displayTitle = exportGeneratedOutlineTitle(item.title, locale, headingStyle);
        const label = `${item.number} ${displayTitle}`;
        let body = '';
        try {
          if (!item.children?.length) {
            if (item.content_mode === 'ai-generate') {
              const file = aiSectionFile(item);
              const section = readAiSection(snapshot.workspaceDir, file);
              if (section.reason) {
                if (layoutCheck) throw new Error(section.detail);
                skippedCount += 1;
                warnings.push(msg(`小节 ${label} 未导出正文：${section.reason}`, `No se exportó el contenido de la sección ${label}: ${section.reason === '正文未生成' ? 'contenido aún no generado' : section.reason === '有图片未生成完成' ? 'imágenes pendientes de generar' : section.reason}`));
                body = `<p><em>[${msg('本小节未完成，未导出正文', 'Esta sección está incompleta; no se exportó contenido')}]</em></p>`;
              } else if (layoutCheck) {
                const problems = findHtmlStructureIssues(section.body);
                if (problems.length) throw new Error(`正文结构不完整：${problems.slice(0, 3).join('；')}`);
                const { $ } = section;
                const blocks = $.root().children().toArray();
                body = blocks.map((node, blockIndex) => mark($.html(node), {
                  section_id: item.id, file, block_index: blockIndex,
                  image: node.name === 'figure' || $(node).find('figure').length > 0,
                  figure_ids: $(node).find('figure').addBack('figure').map((_i, figure) => $(figure).attr('id')).get(),
                  text: $(node).text().slice(0, 160),
                })).join('\n');
                recordImages(label, $('img').map((_i, img) => $(img).attr('data-sv-asset-ref')).get());
              } else {
                body = section.body;
                recordImages(label, section.$('img').map((_i, img) => section.$(img).attr('data-sv-asset-ref')).get());
              }
            } else if (String(item.content || '').trim()) {
              const assetCount = assets.size;
              const failures = [];
              body = await renderMarkdownForRestrictedHtml(item.content, assets, { baseDir: snapshot.workspaceDir, developerLogger, imageFailures: failures, locale, resolveImage: snapshot.resolveImage, convertWebp: snapshot.convertWebp });
              recordImages(label, [...assets.keys()].slice(assetCount));
              for (const reason of failures) recordImageFailure(label, reason);
            } else if (!includeTemplate) {
              const message = getPendingContentModeMessage(item, locale);
              body = message ? `<p><em>[${escapeHtml(message)}]</em></p>` : '';
            }
          }
        } catch (error) {
          throw new Error(`小节 ${label} 导出失败：${error.message}`, { cause: error });
        }
        // Record outline numbers explicitly so headings inside content cannot alter later outline numbering.
        const heading = `<h${level} data-sv-outline-number="${item.number}">${escapeHtml(displayTitle)}</h${level}>`;
        if (includeTemplate) templateChapterIds.push(item.id);
        const templateMarker = includeTemplate ? `<p>SAVIALAYOUT:st_${item.id.replaceAll('-', '')}</p>\n` : '';
        append(`${templateMarker}${layoutCheck ? mark(heading, { section_id: item.id, heading: level }) : heading}\n${body}`, useTemplate, sectionTemplate);
        onProgress?.({ phase: 'running', progress: 10 + Math.round((index + 1) / entries.length * 40), message: msg(`正在读取正文 ${index + 1}/${entries.length}：${label}`, `Preparando sección ${index + 1}/${entries.length}: ${label}`), warnings: [], ...stats });
      }
      let html = ranges.map(range => `<section data-sv-export-template="${range.useTemplate}" data-sv-export-page-template="${range.sectionTemplate}">${range.html}</section>`).join('\n');
      if (locale === 'es') html = html.replace(/>([^<]*)</g, (_match, text) => `>${normalizePendingMarkers(text)}<`);
      developerLogger?.write('export.technical_plan.html.assembled', { section_count: entries.length, skipped_section_count: warnings.length, html_chars: html.length, image_count: cheerio.load(html)('img').length });
      onProgress?.({ phase: 'running', progress: 55, message: msg('正在按当前模板转换整本 Word。', 'Convirtiendo la propuesta completa a Word.'), warnings: [], ...stats });
      const result = await openXmlHelperService.createRestrictedHtmlDocx(html, localizeExportFormat(snapshot.export_format, locale), {
        assetRoot: snapshot.workspaceDir, copyAssets: true, assets, wholeDocument: true,
      });
      const output = templateChapterIds.length
        ? await openXmlHelperService.mergeTemplateChapters(result.bytes, snapshot.bidTemplate, templateChapterIds)
        : result.bytes;
      for (const { assetRef, reason } of result.imageWarnings) {
        for (const label of imageSections.get(assetRef)) recordImageFailure(label, reason);
      }
      let failedImageCount = 0;
      for (const [label, reasons] of imageFailures) {
        failedImageCount += reasons.length;
        warnings.push(msg(`小节 ${label} 有 ${reasons.length} 张图片无法导出，已在原位置用文字标出：${[...new Set(reasons)].join('；')}`, `En la sección ${label} no se pudieron exportar ${reasons.length} imágenes; se indicaron en su lugar: ${[...new Set(reasons)].join('; ')}`));
      }
      if (failedImageCount) developerLogger?.write('export.technical_plan.images.skipped', { image_count: failedImageCount, sections: Object.fromEntries(imageFailures) });
      return {
        buffer: Buffer.from(output), warnings, stats,
        ...(warnings.length ? { message: locale === 'en' ? `Word exported. ${[
          skippedCount ? `${skippedCount} sections are incomplete; complete them and export again` : '',
          failedImageCount ? `${failedImageCount} images could not be exported; review the document` : '',
          missingTemplateCount ? `${missingTemplateCount} template sections were not included; extract them again and review the document` : '',
        ].filter(Boolean).join('; ')}.` : msg(`Word 已导出，${[
          skippedCount ? `其中 ${skippedCount} 个 AI 小节未完成，仅保留标题，请完成后重新导出` : '',
          failedImageCount ? `${failedImageCount} 张图片无法导出，已在原位置用文字标出，请打开文档核对` : '',
          missingTemplateCount ? `${missingTemplateCount} 个模板章节未合并，请重新提取并检查文档` : '',
        ].filter(Boolean).join('；')}。`, `Word exportado. ${[
          skippedCount ? `${skippedCount} secciones están incompletas; complétalas y vuelve a exportar` : '',
          failedImageCount ? `${failedImageCount} imágenes no se exportaron; revisa el documento` : '',
          missingTemplateCount ? `${missingTemplateCount} secciones de plantilla no se incorporaron; vuelve a extraerlas y revisa el documento` : '',
        ].filter(Boolean).join('; ')}.`) } : {}),
        ...(layoutCheck ? { layoutSources } : {}),
      };
    },
  };
}

module.exports = { createTechnicalPlanExport, templateChapterIds };
