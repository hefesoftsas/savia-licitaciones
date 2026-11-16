const fs = require('node:fs');
const { NATIVE_AGENT_TOOLS } = require('./agent/agentToolEnvironment.cjs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const Ajv = require('ajv');
const { countReadableWords } = require('../utils/wordCount.cjs');
const { normalizePendingMarkers } = require('../utils/pendingMarkers.cjs');
const { extractAiSource } = require('../utils/aiSourceExtraction.cjs');
const { findHtmlStructureIssues, assertHtmlStructure, closeOpenTemplates } = require('../utils/htmlStructure.cjs');
const { originalImageReferences } = require('./originalPlanRestoration.cjs');
const { createContentGenerationImageTools, validateContentImageReferences, imageToolNames } = require('./contentGenerationImageTools.cjs');
const { ORIGINAL_GENERATION, resolveImageKinds, imageGenerationList, imageKindList, renderImageKindText, buildImageTypeTable, filterTemplateSample } = require('./contentImageKinds.cjs');
const { AI_IMAGE_STYLES } = require('./aiImageStyles.cjs');
const { WORD_ADJUST_TOOL, WORD_ADJUST_TOOLS, countHtmlWords, planWordAdjustment, createWordAdjustState, buildWordAdjustPrompt, createContentGenerationWordTools } = require('./contentGenerationWordTools.cjs');
const { TASK_FILE_WRITING, taskFilePath, taskFileSchemas, readTaskFile, writeListFile, clearTaskArtifacts, compactResults } = require('./contentGenerationTaskFiles.cjs');
const { SUBMISSION_FIX_TOOL, SUBMISSION_FIX_PARALLEL_THRESHOLD, imageStructure, createContentImageProtection, createSubmissionFixTool } = require('./contentGenerationEditTools.cjs');
const { warmPromptPrefix, sharedPrefixMessages } = require('../utils/promptPrefixCache.cjs');
const { createAiBatchGuard, isBatchCancelled } = require('../utils/aiBatchGuard.cjs');
const { CONSISTENCY_TOOLS, LEDGER_FILE, LEDGER_JSON, extractConsistencyLedger, buildConsistencyPrompt, collectConsistencySubmissionIssues, createContentGenerationConsistencyTools } = require('./contentGenerationConsistencyTools.cjs');
const { TABLE_CLEANUP_TOOL, TABLE_CLEANUP_TOOLS, hasDataTables, buildTableCleanupPrompt, createContentGenerationTableTools } = require('./contentGenerationTableTools.cjs');
const { LAYOUT_TOOL, LAYOUT_TOOLS, buildLayoutPrompt, createContentGenerationLayoutTools } = require('./contentGenerationLayoutTools.cjs');

const CONTENT_GENERATION_AGENT_TASK_KEY = 'technical-plan-content-generation';
// Once stage instructions were sent in the original session, resumes and same-stage continuations send only this sentence, relying on session history and workspace state.
const CONTINUE_PROMPT = '继续之前的任务';
const RESULT_FILE = '正文生成结果.json';
const RESOURCE_DIR = path.join(__dirname, '../resources/content-generation');
const INPUT_FILES = {
  overview: '项目概述.md',
  decisions: '正文编排决策.json',
  outline: '正文完整目录.json',
  rules: '受限HTML生成规范.md',
  imageTypes: '配图类型对照表.md',
  template: '正文模板.html',
  config: '所选模板配置.json',
  facts: '全局事实设定.md',
};
const RESULT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['sections'],
  properties: { sections: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['section_id', 'file', 'words'],
    properties: { section_id: { type: 'string' }, file: { type: 'string' }, words: { type: 'integer', minimum: 1 } },
  } } },
};
const resultAjv = new Ajv({ allErrors: true, strict: true });
const validateResultManifest = resultAjv.compile(RESULT_SCHEMA);
// Protected groups: existing section content except current targets, copied original-plan images, and the program-generated consistency ledger.
const BASELINE_GROUPS = { sections: 'content-sections', originalImages: 'original-images', ledger: 'consistency-ledger' };

// Refresh protection after writing the ledger; restore agent-modified ledgers before submission validation.
const protectLedger = (baseline, workspaceDir) => baseline?.setGroup(BASELINE_GROUPS.ledger,
  [LEDGER_JSON, LEDGER_FILE].filter(file => fs.existsSync(path.join(workspaceDir, file))));

// Runtime records prompted_stage before sending instructions; equality with the current stage means its instructions are already in the session.
function wasStagePrompted(state, stage) {
  return Boolean(stage) && state?.prompted_stage === stage;
}

// All existing workspace section content, registered for protection at the start of a new round.
function listSectionFiles(workspaceDir) {
  const dir = path.join(workspaceDir, '正文');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.html')).map(name => `正文/${name}`) : [];
}

// Name section files by outline ID to avoid duplicate Chinese titles and Windows path characters.
function sectionFile(id) {
  return `正文/${encodeURIComponent(id)}.html`;
}

// Each writing model handles only its section target; the primary session aggregates the document word count.
function wordInstructions(control, checkTotalWords) {
  return `Minimum words for the complete document: ${control.minimumWords || 'unlimited'}; maximum: ${control.maximumWords || 'unlimited'}.\nEach section follows its content_plan.target_words (0 means no target). Aim for the target without repetition or removing necessary information. Targets were assigned during planning; do not redistribute the document target or assign it to a single section. ${checkTotalWords ? 'The main agent checks the total after all targets finish.' : 'Only count the target sections; do not enforce the document-wide target.'} Exclude HTML tags and illustration prompts from word counts.`;
}

// Translate the current facts mode into consistent Chinese requirements shared by the primary session and concurrent input snapshots.
function globalFactsInstructions(mode) {
  const requirement = mode === 'placeholder'
    ? 'Missing facts: retain necessary statements; mark specific facts still uncertain after checking references as “[Pendiente por completar]”. Keep existing placeholders unchanged and do not invent values.'
    : mode === 'omit'
      ? 'Missing facts: retain necessary statements using general wording that does not depend on unknown values. Do not invent people, dates, places, experience, certificates or specifications absent from the references.'
      : 'Missing facts: when necessary information remains unavailable after checking references, supplementary assumptions consistent with the project may be made and must remain consistent across sections.';
  return `${requirement} Before adding facts, check the relevant references and global facts. Apply the missing-fact rule only when there is no explicit evidence. Global facts take precedence over conflicting source materials. Supplementary assumptions apply only to missing information and must not override or change global facts. Do not create unsupported citations.`;
}

// Shared content-writing rules; facts requirements use the same Chinese explanation from planning decisions.
function writingInstructions(hasKnowledgeBase) {
  return `Write illustration prompts, captions and alternative text in the language of the proposal (Spanish or English), not Chinese unless it is part of a proper name or quoted source. Preserve technical identifiers and paths exactly.
Write the bid content using the project background, section description and planned focus. State relevant implementation measures, conditions, responsibilities and deliverables. Be accurate, concrete, actionable, formal and concise; avoid promotional language, empty generalities and repetition.
Adapt applicable references to this project without mentioning ${hasKnowledgeBase ? 'the knowledge base, ' : ''}historical documents or source materials in the body. Global facts keep the document consistent; they are not a checklist for every section. Follow the section title, description and planned focus. Include facts only where relevant, without unrelated paragraphs or repeating project background, personnel, equipment or policies in every section. Do not contradict global facts; apply the missing-fact rule when a fact is unspecified.
Return only restricted HTML body content: no Markdown, code fences, outer section title or explanation. Close every non-void element. Close every figure with </figure> and include one img directly inside; do not nest figures in paragraphs, list items or inline elements such as bold text or links. Keep HTML complete even in long responses. Express internal hierarchy using paragraphs, lists or unnumbered bold lead-ins; use ordered lists only for steps, processes and chronological sequences.
Do not use LaTeX syntax, including $...$, $$...$$, \\(...\\), \\[...\\], \\frac, \\text or \\circ. Express formulas, parameters and units in plain text, Unicode mathematical symbols and restricted HTML <sup> and <sub>, for example 22 ℃ ± 2 ℃, 40%–65%, ≥30 m<sup>3</sup>/(h·person). Convert LaTeX in reference materials while preserving values, units and meaning.`;
}
let imageLayoutModulePromise = null;

// Layout shares use the ESM module shared with Step02 display; Main dynamically imports it as in chromeAssetService.cjs.
function loadImageLayoutModule() {
  if (!imageLayoutModulePromise) {
    imageLayoutModulePromise = import(pathToFileURL(path.join(__dirname, '..', 'shared', 'imageLayout', 'index.mjs')).href);
  }
  return imageLayoutModulePromise;
}

// Allocate layout groups to this round's eligible targets; the shared formula redistributes disabled shares, and all-disabled means no images.
function buildImageLayoutQuota(sections, options, imageLayout) {
  const shares = imageLayout.resolveImageLayoutShares(options);
  const hasLayout = Object.values(shares).some(share => share > 0);
  const total = hasLayout && resolveImageKinds(options).length
    ? sections.filter(section => section.content_plan?.image_needed === true).length : 0;
  return { total_groups: total, ...imageLayout.allocateImageLayoutGroups(total, shares) };
}

// Shared illustration rules explain layout roles; only the primary agent allocates global quotas, not each concurrent section.
// Describe only enabled generation methods; add Mermaid types rendered through HTML to the allowed HTML types.
const IMAGE_TYPE_TRANSLATIONS = [
  ['甘特图', 'Gantt chart'], ['进度网络图', 'schedule network diagram'], ['组织架构图', 'organizational chart'], ['泳道图', 'swimlane diagram'],
  ['RACI 职责矩阵', 'RACI matrix'], ['风险矩阵', 'risk matrix'], ['系统架构与拓扑图', 'system architecture and topology diagram'],
  ['WBS 工作分解结构图', 'WBS diagram'], ['鱼骨图', 'fishbone diagram'], ['柱状图', 'bar chart'], ['折线图', 'line chart'], ['饼图', 'pie chart'],
];
function translateKnownImageTypes(value) {
  return IMAGE_TYPE_TRANSLATIONS.reduce((text, [from, to]) => text.replaceAll(from, to), String(value || ''));
}

function imageInstructions(options, remappedHtmlTypes = []) {
  const kinds = resolveImageKinds(options);
  if (!kinds.length) return 'No illustrations: do not plan images, leave placeholders, or call image tools. Reuse existing original images according to their provided references.';
  const hasAi = kinds.includes('ai');
  const htmlTypes = kinds.includes('html')
    ? `\nAllowed HTML image types: ${[options.htmlImageTypes, ...remappedHtmlTypes].filter(Boolean).map(translateKnownImageTypes).join(', ')}.` : '';
  const aiPreference = hasAi
    ? 'For this batch, target 60% of newly added images using AI. The main agent plans this overall before parallel writing; individual section writers only execute their assignments and do not independently meet that percentage. Prefer suitable physical objects, scenes, outcomes, structures, processes and operations; use the illustration type guide for the generation method. For accurate processes, logic or data, follow the guide instead of changing the generation method to meet the target. Count actual new images: single and imageText each count as one, threeImages as three, and fourImages as four. Exclude original images from numerator and denominator. The target is a planning goal, not a maximum or an exact quota; preserve layout quotas and do not add images to reach it. Resume or retry the same plan and count new images already completed; partial generation counts only this batch and single-section editing does not backfill the full-document proportion.'
    : 'Plan images using the available generation methods and the illustration type guide.';
  const aiDiversity = hasAi
    ? `\nAI image diversity: for every new image specify its type from the illustration guide, subject, viewpoint or shot (close-up, medium, wide, aerial, axonometric, section, etc.), and visual style. Available styles: ${Object.values(AI_IMAGE_STYLES).map(({ label, usage }) => `${label} (${usage})`).join(', ')}. Vary types, subjects, viewpoints and styles throughout the document; avoid depicting mostly staff at desks or working on site. Management and coordination can show equipment, systems, spatial overviews, object details or completed results. Do not repeat the same combination in adjacent sections. Images in a group share a theme but must differ clearly in subject or viewpoint; for steps, vary both, such as an overview, component close-up, terminal or instrument detail and completed result. Do not simply change the action in identical scenes and compositions. Use the same visual style within a group and multiple appropriate styles across the document. Describe prompts positively in the order subject, visible elements, viewpoint and composition, environment and lighting, with distinguishing visual detail. Do not invent numbers, models, brands, organization names or readable text; describe illustrative details such as device shape, materials, space and lighting concretely instead of piling up negative constraints.`
    : '';
  return `Illustrations: allocate layouts according to this batch's quotas; do not use layouts with a zero quota.\nAvailable generation methods: ${kinds.map(kind => ({ ai: 'AI images (aiImage)', html: 'HTML images (htmlImage)', mermaid: 'Mermaid diagrams (mermaid)' })[kind]).join(', ')}.${htmlTypes}\nimage_needed indicates whether a section can receive new images: false means none; true means it can receive layouts assigned by the main agent. image_suitability_score is a 0–10 suitability score for selecting appropriate sections, not a reason to cancel batch quotas. Do not require exactly one group per eligible section or impose an image limit per section.\nFor batch generation, the main agent allocates image_layout_quota. Parallel section writers execute only their assigned layouts, group counts, purposes and methods; do not change methods, assume or redistribute global quotas, or add images without an assigned layout. single is one self-explanatory image; imageText is one image on the left with explanatory text on the right. Respect their separate group quotas. threeImages is a row of three; fourImages is a four-image grid. Respect each quota and do not split groups into singles. Images in a group address the same theme with different information; avoid repetition. Layout quotas apply only to this batch; later single-section editing follows the user request without redistributing document-wide quotas. ${hasAi ? 'The AI image target applies to this entire batch. ' : ''}Neither sections nor the full document must use every available method.\n${aiPreference}${aiDiversity}\nConsult 配图类型对照表.md for each new image's intended content and structure, and use only the listed methods. If no exact type matches, prefer the method for a similar purpose and structure; ${hasAi ? 'if still unclassifiable, use AI image generation.' : 'if still unclassifiable, do not add the image.'} These rules apply only to new illustrations. Reuse existing original images by their provided mappings, regardless of no-image settings or new layout quotas.`;
}

// Give organization/expansion rules and current word counts to the model without adding programmatic shortening or content audits.
function restorationInstructions(control, existingTotalWords) {
  return `When a section has restored_content, check its entire draft first, then organize its body according to the current project, section responsibilities and planned focus. Preserve substantive draft information and convert it to restricted HTML; do not replace information that must be retained with newly rewritten content. Generate sections without drafts normally and do not borrow material from other sections.
At the start of this run, the document already has ${existingTotalWords} words; the document maximum is ${control.maximumWords || 'unlimited'}. The section target is content_plan.target_words (0 means unlimited), and restored_content.words is the restored draft count. If the restored count exceeds the section target or existing document content exceeds the document maximum, organize this section without expansion and do not remove substantive content to reduce word count. Otherwise expand appropriately under existing requirements. Compare only configured limits. The document maximum determines whether existing document content is over the limit; it is not an individual section target. Unset section targets and document limits do not participate in their respective comparisons.
Preserve substantive draft information, technical parameters, measures and commitments. Global facts take precedence when there is a conflict; read and verify them as needed and do not make unsupported changes.
Preserve all original table data and meaning, all original images and their reference order. Table and image planning only governs new content: original tables are exempt from table.needed, and original images are exempt from no-image mode and image_needed and do not consume new layout quotas. Reuse asset_ref directly according to restored_content.images; do not regenerate original images or leave generation placeholders. Each original figure must use data-sv-generation="${ORIGINAL_GENERATION}" and exactly one nonempty template data-sv-role="prompt" stating “复用原方案图片，不重新生成”, optionally followed by a description. Original image identity and paths come from restored_content.images. Preserve img, captions and other required attributes.`;
}

// Refresh input snapshots for each new target round; do not rewrite on resume, and always retain existing section HTML and images.
async function buildContentGenerationFiles({ outline, targets, plans, sectionStates = {}, projectOverview, globalFacts, globalFactsMode, wordControl, generationOptions, hasOriginalPlan, restoredContents, existingTotalWords, requirement, template, knowledgeBaseService, documentIds, checkTotalWords = true }) {
  if (!template) throw new Error('请先在“长嘛样”选择有效的正文模板');
  const imageLayout = await loadImageLayoutModule();
  const targetIds = new Set(targets.map(({ item }) => item.id));
  const sections = [];
  const completedSections = [];
  let totalAiSections = 0;
  const restoredFiles = [];
  function visit(items, parents = []) {
    return items.map(item => {
      const node = { id: item.id, number: item.number, title: item.title, description: item.description || '', content_mode: item.content_mode };
      if (item.children?.length) node.children = visit(item.children, [...parents, item.title]);
      else if (item.content_mode === 'ai-generate') {
        totalAiSections++;
        if (targetIds.has(item.id)) {
          const section = { ...node, content_plan: plans[item.id]?.plan, chapter_path: [...parents, item.title].join(' > '), file: sectionFile(item.id) };
          const content = hasOriginalPlan && restoredContents[item.id];
          if (content) {
            const file = `已还原内容/${encodeURIComponent(item.id)}.md`;
            restoredFiles.push({ path: file, content });
            section.restored_content = {
              file, words: countReadableWords(content),
              images: [...new Set(originalImageReferences(content))].map(source_ref => ({
                source_ref,
                asset_ref: `原图/${crypto.createHash('sha256').update(source_ref).digest('hex')}${path.posix.extname(decodeURIComponent(new URL(source_ref).pathname))}`,
              })),
            };
          }
          sections.push(section);
        } else {
          node.content_plan = plans[item.id]?.plan;
          if (sectionStates[item.id]?.status === 'success') {
            completedSections.push({ id: item.id, number: item.number, title: item.title, file: sectionFile(item.id) });
          }
        }
      }
      return node;
    });
  }
  const tree = visit(outline);
  // Aggregate saved planning only; do not reallocate words, tables, or images. The completion list is a pre-round snapshot.
  const executionSummary = {
    total_ai_sections: totalAiSections,
    target_sections: sections.length,
    completed_before_run: completedSections.length,
    target_words: sections.reduce((sum, section) => sum + (section.content_plan?.target_words || 0), 0),
    unspecified_word_target_sections: sections.filter(section => !section.content_plan?.target_words).length,
    image_candidate_ids: sections.filter(section => section.content_plan?.image_needed === true).map(section => section.id),
    table_section_ids: sections.filter(section => section.content_plan?.table?.needed === true).map(section => section.id),
  };
  const referenceFiles = {
    ...INPUT_FILES,
    ...(documentIds.length ? { knowledge_index: '知识库/索引.json' } : {}),
  };
  // Specifications, comparison tables, and samples include only enabled generation methods; concurrent writing reads the same workspace files.
  const imageKinds = resolveImageKinds(generationOptions);
  const imageTypeTable = buildImageTypeTable(fs.readFileSync(path.join(RESOURCE_DIR, INPUT_FILES.imageTypes), 'utf8'), imageKinds);
  // Put fixed-size requirements and statistics before lists that grow with section count so paged reads retrieve requirements first.
  const files = [
    { path: INPUT_FILES.outline, content: JSON.stringify({ outline: tree }, null, 2) },
    { path: INPUT_FILES.overview, content: projectOverview || '未提供项目概述。' },
    { path: INPUT_FILES.decisions, content: JSON.stringify({ execution_summary: executionSummary, image_layout_quota: buildImageLayoutQuota(sections, generationOptions, imageLayout), table_requirement: generationOptions.tableRequirement, word_requirements: wordInstructions(wordControl, checkTotalWords), word_control: { minimumWords: wordControl.minimumWords, maximumWords: wordControl.maximumWords, checkTotalWords }, image_requirements: imageInstructions(generationOptions, imageTypeTable.remappedHtmlTypes), ...(hasOriginalPlan ? { restoration_requirements: restorationInstructions(wordControl, existingTotalWords) } : {}), global_facts_mode: globalFactsMode, global_facts_requirements: globalFactsInstructions(globalFactsMode), user_requirement: requirement || '', has_knowledge_base: documentIds.length > 0, reference_files: referenceFiles, completed_sections: completedSections, targets: sections }, null, 2) },
    { path: INPUT_FILES.rules, content: renderImageKindText(fs.readFileSync(path.join(RESOURCE_DIR, INPUT_FILES.rules), 'utf8'), imageKinds) },
    { path: INPUT_FILES.imageTypes, content: imageTypeTable.content },
    // Share the template-preview sample, removing only sample image references while retaining image-group structure and prompts.
    { path: INPUT_FILES.template, content: filterTemplateSample(fs.readFileSync(path.join(RESOURCE_DIR, INPUT_FILES.template), 'utf8')
      .replace(/<img\b[^>]*>/gi, tag => tag.replace(/\s+(?:src|data-sv-asset-ref)="[^"]*"/gi, '')), imageKinds) },
    { path: INPUT_FILES.config, content: JSON.stringify(template, null, 2) },
    { path: INPUT_FILES.facts, content: globalFacts.map(group => `## ${normalizePendingMarkers(group.title)}\n${normalizePendingMarkers(group.content)}`).join('\n\n') || '未设定全局事实。' },
    ...restoredFiles,
  ];
  if (!documentIds.length) return files;
  const references = knowledgeBaseService.readReferences(documentIds, { includeMarkdown: true, includeItems: true });
  const index = [];
  for (const id of documentIds) {
    const reference = references.find(entry => entry.document.id === id);
    if (!reference?.markdown?.trim()) throw new Error(`选中的知识库缺少完整正文：${reference?.document?.file_name || id}`);
    const file = `知识库/${encodeURIComponent(id)}.md`;
    files.push({ path: file, content: reference.markdown });
    index.push({ document_id: id, file, document: reference.document, items: reference.items.map(item => ({ id: `${id}::${item.id}`, title: item.title, resume: item.resume })) });
  }
  files.push({ path: '知识库/索引.json', content: JSON.stringify(index, null, 2) });
  return files;
}

// Inline only fixed-size requirements and statistics in prompts; leave target, image-candidate, and table-ID lists in the execution manifest for on-demand reads.
function buildRunSummary({ targets: _targets, completed_sections: _completed, execution_summary: summary, ...requirements }) {
  const { image_candidate_ids: candidates = [], table_section_ids: tables = [], ...counts } = summary;
  return { execution_summary: { ...counts, image_candidate_sections: candidates.length, table_sections: tables.length }, ...requirements };
}

// Copy original images when first creating the session; resumes use workspace copies without rereading originals. Return workspace paths for protection registration.
function copyRestoredImages(workspaceDir, resolveOriginalImagePath) {
  const decisions = JSON.parse(fs.readFileSync(path.join(workspaceDir, INPUT_FILES.decisions), 'utf8'));
  const copied = new Set();
  for (const section of decisions.targets) {
    for (const { source_ref, asset_ref } of section.restored_content?.images || []) {
      if (copied.has(asset_ref)) continue;
      const target = path.join(workspaceDir, asset_ref);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(resolveOriginalImagePath(source_ref), target);
      copied.add(asset_ref);
    }
  }
  return [...copied];
}

// Shared structural correction instructions, consistent with writing requirements.
const STRUCTURE_RULE = '除 img 等空元素外，每个元素都写出对应的结束标签；每个 figure 以 </figure> 结束并直接包含一个 img，figure 不放在段落、列表项或加粗、链接等行内元素中。';
// After image protection begins, do not regenerate content; only correct structure according to the rules.
const structureFixRule = protectionActive => `${STRUCTURE_RULE}${protectionActive ? '' : '出现异常结束标记的小节多为写作输出中断，在生成任务文件中给该节加 "regenerate": true 重新生成。'}`;

// At the output boundary check file type and usable content only; generate specific HTML structure according to the input specification.
function checkSectionHtml(html) {
  const content = String(html).trim();
  if (!content.startsWith('<!-- savia:block -->') || content.includes('```') || !/<(?:p|ol|ul|table)\b/i.test(content) || !countHtmlWords(content)) {
    throw new Error('必须输出带 savia:block 分隔的有效受限 HTML 正文，不得输出 Markdown 或代码围栏');
  }
  return content;
}

// Inspect actual section artifacts and return usability issues and facts; do not decide quality acceptance or repair-round counts here.
function inspectSectionArtifact(workspaceDir, section, { recordedImages = null, checkStructure = true } = {}) {
  const base = { section_id: section.id, number: section.number, title: section.title, file: section.file };
  const target = path.join(workspaceDir, section.file);
  if (!fs.existsSync(target)) return {
    section: { ...base, words: 0 },
    issues: [{ ...base, type: 'missing', severity: 'blocking', message: '小节 HTML 文件不存在', fixable: false }],
    facts: { has_data_tables: false },
  };
  const html = fs.readFileSync(target, 'utf8');
  const words = countHtmlWords(html);
  const issues = [];
  try { checkSectionHtml(html); }
  catch (error) { issues.push({ ...base, type: 'content', severity: 'blocking', message: error.message, fixable: Boolean(words) }); }
  try { validateContentImageReferences(workspaceDir, html); }
  catch (error) {
    if (error.code) throw error;
    issues.push({ ...base, type: 'image-ref', severity: 'blocking', message: error.message, fixable: false });
  }
  if (checkStructure) {
    for (const message of findHtmlStructureIssues(html)) {
      issues.push({ ...base, type: 'structure', severity: 'blocking', message, fixable: true });
    }
  }
  if (recordedImages && imageStructure(html) !== recordedImages.structure) {
    issues.push({ ...base, type: 'image-block', severity: 'blocking', message: '图片块、图注、提示词、图片引用、数量、顺序或图片表格布局与图片保护开始时不一致',
      original_image_blocks: recordedImages.blocks, fixable: true });
  }
  return { section: { ...base, words }, issues, facts: { has_data_tables: hasDataTables(html) } };
}

// Report remaining tables under current stage rules; accepted sections are exempt only from this quality requirement.
function collectTableSubmissionIssues(inspections, acceptedSectionIds = []) {
  const accepted = new Set(acceptedSectionIds);
  return inspections.filter(item => item.facts.has_data_tables && !accepted.has(item.section.section_id)).map(item => ({
    ...item.section, type: 'table', severity: 'quality', message: '仍有数据表格，需要转换为段落或列表并保留全部信息', fixable: true,
  }));
}

// Submission-repair tools recheck selected sections using base validation and the same table-quality rules.
function sectionSubmissionIssues(workspaceDir, section, { imageProtection, requireNoDataTables = false, acceptedTableSectionIds = [] } = {}) {
  const inspected = inspectSectionArtifact(workspaceDir, section, { recordedImages: imageProtection?.recorded(section.file) });
  return [...inspected.issues, ...(requireNoDataTables ? collectTableSubmissionIssues([inspected], acceptedTableSectionIds) : [])];
}

// Prepare the issue list and action guidance; only the shared runtime decides repair attempts and acceptance.
function contentSubmissionInstructions(workspaceDir, issues, protectionActive) {
  const sectionIssues = issues.filter(item => item.section_id && ['missing', 'content', 'image-ref', 'structure', 'image-block', 'table'].includes(item.type));
  if (!sectionIssues.length) return '按问题说明修正当前结果，保留已完成内容和当前阶段范围。';
  const file = writeListFile(workspaceDir, 'submission', { issues: sectionIssues });
  const sectionCount = new Set(sectionIssues.map(item => item.section_id)).size;
  const manual = sectionIssues.some(item => !item.fixable);
  const route = sectionCount > SUBMISSION_FIX_PARALLEL_THRESHOLD
    ? '涉及小节超过 ' + SUBMISSION_FIX_PARALLEL_THRESHOLD + ' 个，调用 ' + SUBMISSION_FIX_TOOL + ' 并发修复' + (manual ? '，正文或图片文件缺失等子任务无法处理的问题由你直接处理' : '')
    : '由你直接修改对应小节';
  return '完整小节问题见 ' + file + '。' + route + '，修复后重新提交。图片块按清单中的原始图片块恢复，保留文字修改。' + structureFixRule(protectionActive);
}

// Read the manifest and actual section artifacts once for both submission acceptance and programmatic access.
function inspectContentArtifacts(workspaceDir, { checkStructure = true, imageProtection } = {}) {
  const decisions = JSON.parse(fs.readFileSync(path.join(workspaceDir, INPUT_FILES.decisions), 'utf8'));
  const issues = [];
  const manifestPath = path.join(workspaceDir, RESULT_FILE);
  let manifest;
  const manifestIssue = message => ({ type: 'manifest', severity: 'blocking', file: RESULT_FILE, message });
  if (!fs.existsSync(manifestPath)) issues.push(manifestIssue(RESULT_FILE + ' 尚未生成'));
  else {
    const content = fs.readFileSync(manifestPath, 'utf8');
    try { manifest = JSON.parse(content); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      issues.push(manifestIssue(RESULT_FILE + ' 不是有效 JSON：' + error.message));
    }
  }
  if (manifest !== undefined) {
    if (checkStructure && !validateResultManifest(manifest)) {
      issues.push(...validateResultManifest.errors.map(error => manifestIssue(RESULT_FILE + ' ' + error.instancePath + ' ' + error.message)));
    } else if (!manifest || !Array.isArray(manifest.sections)) {
      issues.push(manifestIssue(RESULT_FILE + ' 必须包含 sections 数组'));
    } else {
      const entries = new Map(manifest.sections.map(item => [item.section_id, item]));
      if (entries.size !== decisions.targets.length || manifest.sections.length !== decisions.targets.length) {
        issues.push(manifestIssue('正文生成结果清单与本次目标小节不一致'));
      }
      for (const section of decisions.targets) {
        if (entries.get(section.id)?.file !== section.file) issues.push(manifestIssue('正文结果缺少小节或文件路径不匹配：' + section.id));
      }
    }
  }
  const inspections = decisions.targets.map(section => inspectSectionArtifact(workspaceDir, section, {
    checkStructure, recordedImages: imageProtection?.recorded(section.file),
  }));
  issues.push(...inspections.flatMap(item => item.issues));
  return { result: { workspaceDir, sections: inspections.map(item => item.section) }, issues, inspections };
}

// Read current content with shared artifact validation; do not make agent-stage quality decisions.
function readContentGenerationResult(workspaceDir, { checkStructure = false, imageProtection, requireNoDataTables = false, acceptedTableSectionIds = [] } = {}) {
  const inspected = inspectContentArtifacts(workspaceDir, { checkStructure, imageProtection });
  const issues = [...inspected.issues, ...(requireNoDataTables ? collectTableSubmissionIssues(inspected.inspections, acceptedTableSectionIds) : [])];
  if (issues.length) {
    const error = new Error(issues.map(item => item.message).join('\n'));
    error.issues = issues;
    throw error;
  }
  return inspected.result;
}

// Agents submit writing tasks in batches; reuse the scoped AI queue for real concurrency and unified cancellation.
// submissionOptions returns current stage validation conditions for section rechecks by submission-repair tools.
// On consecutive upstream failures in a batch, failTask ends the whole task instead of returning it for repeated agent retries.
function createContentGenerationTools({ aiService, agentService, generationOptions = {}, hasKnowledgeBase = false, signal, onActivity, imageProtection, consistency, tableCleanup, wordAdjust, onProgress = () => {}, submissionOptions = () => ({}), failTask = () => {} }, { Type, workspaceDir, setActiveTools, baseline }) {
  const activity = { pending: 0 };
  const read = file => fs.readFileSync(path.join(workspaceDir, file), 'utf8');
  const imageKinds = resolveImageKinds(generationOptions);
  const hasAiImages = imageKinds.includes('ai');
  const imagePlanNote = imageKinds.length
    ? `For images specify layout, group count, purpose of each image, image type and generation method (${imageGenerationList(imageKinds)})${hasAiImages ? '; for AI images also specify scene type, subject, viewpoint and visual form' : ''}. ` : '';
  let input;
  // Register tools during initial planning, but read program-processed content inputs only at first writing.
  function loadInput() {
    if (!input) {
      const decisions = JSON.parse(read(INPUT_FILES.decisions));
      input = { decisions, targets: new Map(decisions.targets.map(section => [section.id, section])),
        savedIds: new Set(decisions.targets.filter(section => {
          const filePath = path.join(workspaceDir, section.file);
          return fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').trim();
        }).map(section => section.id)),
        overview: read(INPUT_FILES.overview), facts: read(INPUT_FILES.facts), rules: read(INPUT_FILES.rules),
        imageTypes: read(INPUT_FILES.imageTypes), template: read(INPUT_FILES.template), config: read(INPUT_FILES.config) };
    }
    return input;
  }
  // Inject section validation as a dependency; editing tools report results without starting another submission-repair loop.
  const inspectSection = (section, options) => inspectSectionArtifact(workspaceDir, section, options);
  return [{
    name: 'generate-sections', label: '批量生成正文小节',
    description: `Submit all sections from ${taskFilePath('sections')} for restricted HTML generation as {"sections":[{"section_id":"…","instructions":"…","references":"…"}]}; all three fields are required. Copy section_id exactly from the corresponding id in the content decisions targets, not number. In instructions include only new image arrangements and genuinely necessary additions beyond the existing plan and shared rules. ${imagePlanNote}Use an empty string when there are no additions; retries may include specific corrections. In references include relevant verbatim excerpts and sources from supplemental material${hasKnowledgeBase ? ', including the knowledge base' : ''}; the program supplies the complete global facts, so use an empty string if there is no supplemental material. The program supplies the section plan, full global facts and shared materials; do not repeat the target length, writing focus, table plan or formatting rules. Sections with generated content are skipped automatically, so resubmitting does not rewrite them; add "regenerate": true only when a complete rewrite is required. ${TASK_FILE_WRITING}The queue uses the user's concurrency setting, queues excess work and saves each section independently. Returns total, success, skipped and unresolved (failed sections and reasons); correct the instructions in the file and resubmit failed sections.`,
    executionMode: 'sequential',
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_callId, _params, toolSignal, onUpdate) {
      const { decisions, targets, savedIds, overview, facts, rules, imageTypes, template, config } = loadInput();
      const combinedSignal = AbortSignal.any([signal, toolSignal].filter(Boolean));
      const { sections: jobs } = readTaskFile(workspaceDir, 'sections');
      const ids = jobs.map(section => section.section_id);
      const invalid = ids.filter((id, index) => !targets.has(id) || ids.indexOf(id) !== index);
      if (invalid.length) throw new Error(`任务文件只能包含本次目标小节，且同一小节不能重复出现：${[...new Set(invalid)].join('、')}`);
      // Treat generated content as complete and skip duplicate task-file submissions; regenerate explicitly requests a full section rewrite.
      const generated = id => {
        const file = path.join(workspaceDir, targets.get(id).file);
        return fs.existsSync(file) && Boolean(fs.readFileSync(file, 'utf8').trim());
      };
      const skipped = new Map(jobs.filter(job => !job.regenerate && generated(job.section_id))
        .map(job => [job.section_id, { section_id: job.section_id, file: targets.get(job.section_id).file, status: 'skipped' }]));
      const pending = jobs.filter(job => !skipped.has(job.section_id));
      for (const id of skipped.keys()) savedIds.add(id);
      onActivity?.({ progress: { step: 'writing', label: '正在生成小节正文', unit: '节', total: targets.size, items: ids.map(id => ({ id, status: skipped.has(id) ? 'success' : 'running' })) } });
      activity.pending += 1;
      // Put round-wide rules in system and shared materials in a separate user message before section content to enable provider prefix caching.
      const system = `${writingInstructions(decisions.has_knowledge_base)}\n\nFact-handling requirements for this project:\n${decisions.global_facts_requirements}\n\n${rules}\n\nIllustration type guide (use it to select methods for new images):\n${imageTypes}\n\nIllustration requirements:\n${decisions.image_requirements}\n\nWriting instructions:\nFollow this section's content_plan.target_words; zero means no target. Do not substitute document-wide limits or other section targets. Follow content_plan: when table.needed=false do not add data tables. Add images only according to layouts, group counts, purposes and methods assigned by the main agent in this section's additional instructions; do not change their methods. ${hasAiImages ? 'For AI images, describe the assigned type, subject and viewpoint positively in the template and specify the visual style. ' : ''}Do not allocate global quotas${hasAiImages ? ' or independently meet the AI image percentage' : ''}. Without an assigned layout, add no images; in no-image mode or when image_needed=false, leave no new image blocks. During parallel writing, create only the restricted HTML structure for new images, specifying generation method, purpose, alt text and required caption; do not set an asset reference yet. The main agent inserts the asset_ref returned by the image tool; reuse original images using their provided references. You have no search or image generation tools. Check only the supplied materials; file reading, image generation and submission of result manifests are the main agent's responsibility. Return only this section's HTML and never invent image paths.`;
      const sharedInput = `Project overview:
${overview}

Global facts (complete):
${facts}

Word requirements:
${decisions.word_requirements}

Additional user requirements:
${decisions.user_requirement}

Restricted HTML template:
${template}

Selected template configuration:
${config}`;
      // Stop dispatching remaining sections and end the task on consecutive upstream failures; preserve saved sections.
      const guard = createAiBatchGuard({ signal: combinedSignal });
      try {
        if (pending.length > 1) await warmPromptPrefix({ aiService, messages: sharedPrefixMessages(system, sharedInput), signal: guard.signal, onActivity, logTitle: 'Agent HTML正文-公共前缀预热', label: '正文公共材料' });
        const generatedResults = new Map((await Promise.all(pending.map(async job => {
          const section = targets.get(job.section_id);
          try {
            guard.signal.throwIfAborted();
            const restoredContext = section.restored_content
              ? `\n\nRestoration requirements for this section (original table and image preservation takes precedence over restrictions on new content):\n${decisions.restoration_requirements}\n\nRestored draft for this section (complete content):\n${read(section.restored_content.file)}`
              : '';
            // Fail truncated replies immediately; repair malformed prompt closing markers losslessly, but do not save other structural failures. Return them to the primary agent for section retry.
            const html = closeOpenTemplates(checkSectionHtml(extractAiSource(await aiService.chat({
              signal: guard.signal, logTitle: `Agent HTML正文-${section.number}-${section.title}`, reject_truncated_output: true,
              messages: sharedPrefixMessages(system, sharedInput, `Section plan:
${JSON.stringify(section, null, 2)}${restoredContext}

Section illustration plan and additional requirements:
${job.instructions.trim() || 'No additional requirements or assigned new illustrations; preserve original images according to the section draft rules.'}

Supplementary reference excerpts:
${job.references || 'Not provided'}`),
            }), 'html'))).html;
            assertHtmlStructure(html, { checkSourceCompleteness: true });
            guard.signal.throwIfAborted();
            guard.success();
            const target = path.join(workspaceDir, section.file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(`${target}.tmp`, html, 'utf8');
            fs.renameSync(`${target}.tmp`, target);
            savedIds.add(section.id);
            onActivity?.({ progress: { step: 'writing', label: '正在生成小节正文', unit: '节', items: [{ id: section.id, status: 'success' }] } });
            const result = { section_id: section.id, file: section.file, words: countHtmlWords(html), status: 'success' };
            onProgress({ ...result, completed: savedIds.size, total: targets.size });
            onUpdate?.({ content: [{ type: 'text', text: `已保存 ${section.file}（${savedIds.size}/${targets.size}）` }], details: { ...result, title: section.title } });
            return result;
          } catch (error) {
            const cancelled = isBatchCancelled(error, guard.signal);
            if (!cancelled) guard.failure(error);
            onActivity?.({ progress: { step: 'writing', label: '正在生成小节正文', unit: '节', items: [{ id: section.id, status: cancelled ? 'cancelled' : 'error' }] } });
            const result = { section_id: section.id, status: 'error', error: error.message };
            // Notify the primary agent after section failure or cancellation to refresh the no-progress timer.
            onUpdate?.({
              content: [{ type: 'text', text: `${cancelled ? '已取消' : '生成失败'} ${section.file}：${error.message}` }],
              details: result,
            });
            return result;
          }
        }))).map(result => [result.section_id, result]));
        combinedSignal.throwIfAborted();
        if (guard.error) {
          failTask(guard.error);
          throw guard.error;
        }
        // Send only statistics and failed sections to the model; retain per-section results in details.
        const results = ids.map(id => skipped.get(id) || generatedResults.get(id));
        return { content: [{ type: 'text', text: JSON.stringify(compactResults(results)) }], details: { results } };
      } finally { activity.pending -= 1; }
    },
  },
  ...createContentGenerationConsistencyTools({ agentService, aiService, signal, activity, onActivity, consistency, inspectSection, failTask,
    protectLedger: () => protectLedger(baseline, workspaceDir) }, { Type, workspaceDir }),
  ...createContentGenerationTableTools({ aiService, signal, onActivity, tableCleanup, failTask }, { Type, workspaceDir }),
  ...createContentGenerationWordTools({ aiService, signal, activity, onActivity, imageProtection, inspectSection, wordAdjust, failTask,
    validateHtml: html => assertHtmlStructure(checkSectionHtml(html)) }, { Type, workspaceDir, setActiveTools }),
  ...createContentGenerationImageTools({ aiService, signal, onActivity, failTask, imageKinds, getSections: () => JSON.parse(read(INPUT_FILES.decisions)).targets, htmlImageOptimization: generationOptions.htmlImageOptimization === true,
    beforeApply: () => imageProtection?.beforeToolCall({ toolCall: { name: 'apply-section-images' } }),
  }, { Type, workspaceDir }),
  // After entering table cleanup, submission-repair children also convert data tables according to the current stage.
  createSubmissionFixTool({ agentService, signal, activity, onActivity,
    inspectSection,
    preserveDataTables: () => !submissionOptions().requireNoDataTables,
    readTargets: () => new Map(JSON.parse(read(INPUT_FILES.decisions)).targets.map(section => [section.id, section])),
    checkSection: section => sectionSubmissionIssues(workspaceDir, section, submissionOptions()),
    // Once protection begins, restore images from that baseline; earlier structural repair may change image wrappers without comparing images.
    expectedImages: section => submissionOptions().imageProtection?.recorded(section.file) || null,
    structureRule: STRUCTURE_RULE,
  }, { Type, workspaceDir })];
}

// Primary-agent image-tool instructions describe parameters, source, and rendering tools only for enabled methods; omit in no-image mode.
function mainImageToolSteps(kinds) {
  if (!kinds.length) return '';
  const html = kinds.includes('html');
  const mermaid = kinds.includes('mermaid');
  const source = html || mermaid;
  const sourceLabel = [html && 'HTML', mermaid && 'Mermaid'].filter(Boolean).join('/');
  const renderFiles = [html && taskFilePath('renderHtml'), mermaid && taskFilePath('renderMermaid')].filter(Boolean).join(' or ');
  const renderTools = [html && 'render-html-image', mermaid && 'render-mermaid-image'].filter(Boolean).join(' or ');
  return [
    `Complete required images in this session: write new images for this run to ${taskFilePath('images')} as {"images":[{"image_id":"inventory identifier","kind":"${imageKindList(kinds)}","prompt":"…"}]}, then call generate-section-images. Each item supplies inventory image_id, kind and prompt.`,
    kinds.includes('ai') ? 'For AI images, size is required: read each figure’s data-sv-size and select a concrete matching image size for square=1:1, wide=3:2, tall=3:4 or panorama=16:9. For the current gpt-image-2-1k model, tall uses the verified 768x1024. Do not pass frame names as sizes, omit size or default every image to square; keep matching aspect ratio and orientation in the prompt. style is required and must match the visual form specified by the template. Describe the image positively without conflicting with style or repeating the program’s brand, watermark and unrelated-text restrictions.' : '',
    html ? 'HTML items require frame_size matching the body figure frame.' : '',
    source ? `${sourceLabel} prompts must state the image type, purpose, accurate content and data; do not supply only paths or ask a parallel model to search independently.` : '',
    `The program submits all items to the appropriate generation queues, with overflow queued automatically${source ? '; each source is rendered locally immediately when ready, without waiting for other images' : ''}. Items with valid images are skipped; set "regenerate": true to replace an existing image, but do not regenerate original-plan images. Successful images are inserted into the body immediately. After submission inspect status, stage and error for each unresolved item, and follow tool instructions.`,
    source ? `For failed or unfinished items with source_file, read and edit the source as needed, then write ${renderFiles} with image_id and source_file${html ? ' and frame_size for HTML' : ''}, and call ${renderTools}${html && mermaid ? ' according to type' : ''}. Do not regenerate successful source; retry generation only for failed items without source.` : '',
    html ? 'HTML design width is 1240px; heights for square/wide/tall/panorama are 1240/827/1653/698px, including 40px padding on each side. Use body as canvas and Flex/Grid to fill the inner area without another wrapper or duplicate margins. Use a restrained professional palette and clear hierarchy. Avoid large empty bottom areas or meaningless filler and empty cards. Illustration HTML may use CSS and is not restricted to body HTML tags.' : '',
    mermaid ? 'Fix Mermaid syntax by editing the saved .mmd file and submitting it to render-mermaid-image.' : '',
    source ? 'Source files are saved in 图片/.' : '',
    `Successful image tools update each corresponding img reference automatically; do not call apply-section-images or edit the body manually. Only for applied=false items, refresh the inventory based on apply_error, write ${taskFilePath('applyImages')} with image_id, returned asset_ref and previous_asset_ref, and retry apply-section-images. Never apply non-success items, fill src, invent paths or embed source in the body. Generate every image in a group. On resume compare the latest inventory (successful images already applied) with unfinished items from tool responses${source ? ', reusing saved source' : ''}. Completed images are skipped on resubmission; ${source ? 'send remaining items without source to generation and those with source to the appropriate render tool' : 'resubmit remaining items to generation'}. Fix execution errors as reported; never treat failure as success or change the generation method.`,
  ].join(' ');
}

// One persistent agent handles reading, searching, batch dispatch, and the final file manifest; prompts define tasks and scope, while the agent chooses reading and batching.
// Illustration instructions cover only enabled generation methods.
function buildContentGenerationPrompt(resuming, hasKnowledgeBase, hasOriginalPlan, runSummary, planningHandoff, imageKinds = []) {
  const hasAi = imageKinds.includes('ai');
  const generationNote = imageKinds.length ? ` (${imageGenerationList(imageKinds)})` : '';
  return `You are responsible for generating the restricted HTML body of this bid document in one persistent session.
1. The execution summary below is derived from 正文编排决策.json and contains the requirements, layout quotas and counts for this run:
${JSON.stringify(runSummary)}
${planningHandoff ? 'The program has completed and saved initial planning: word targets have been corrected, and tables and illustrations selected according to settings. The final word target, table plan and image flags for each target are in targets in 正文编排决策.json; do not use draft candidates. Continue this session’s existing writing focus and knowledge entries without replanning or rereading unchanged outlines and tender materials. ' : ''}Data that grows with the number of sections is saved only in files: targets in 正文编排决策.json (current targets, final plans, HTML paths and restoration references), image and table candidate IDs in execution_summary, completed_sections, and the complete outline in 正文完整目录.json. Read or search as needed, using paginated read or commands such as rg and jq. Read the entire fixed-length 受限HTML生成规范.md; consult 项目概述.md as needed. Refer to 正文模板.html and 所选模板配置.json. The template is a structural example: do not copy its text or require every element in each section.
2. ${hasKnowledgeBase ? 'A knowledge base is selected; locate references using 知识库/索引.json. knowledge.item_ids in the plan correspond to index IDs. Read the original content from the relevant source document; index titles and summaries are only for locating it. ' : ''}The program automatically includes the complete 全局事实设定.md in each section writing request; do not duplicate excerpts merely to pass facts. You may read it as needed to check requirements and plan illustrations. The main agent retrieves and supplies supplementary excerpts as necessary; parallel writing models check materials supplied in their requests, while editing subagents read workspace files as needed. Follow the audit instructions for the audit reading scope. Follow global_facts_requirements in the execution summary.
3. Generate only AI-generated leaf sections listed in targets in 正文编排决策.json. Consult the complete outline as needed for parent, child and neighboring sections. execution_summary already provides AI section counts, target counts and word counts, the number of sections without word targets, illustration candidates and table-selected sections; image_layout_quota provides layout quotas. Use those results, and find section IDs in 正文编排决策.json. Verify discrepancies against the relevant files. Use program tool results for counts and checks: list-section-images summary is authoritative for layout groups, generation method distribution, and images missing captions, data-sv-fit or valid references; check-word-count is authoritative for words; the program validates HTML structure and image blocks at submission. Do not write extra scripts or intermediate files to duplicate these checks. completed_sections records non-target sections completed before this run, not live progress. When resuming, use tool results and actual files; an existing HTML file alone does not mean images and audit are complete. Follow the writing focus, table and image flags, document and section word requirements and user instructions. Use each section’s content_plan.target_words without changing or redistributing targets. A tolerance of about 10% may be used only for validating results, not passed to generate-sections or to writing models. Use the provided output paths; do not modify input files or the business database. Preserve non-target HTML, images and source; use new names for new illustration source files. ${hasOriginalPlan ? 'Restored drafts are in use: read restoration_requirements in the summary. The tool automatically supplies each writing request with the complete section draft, original image mapping and global facts; read restored_content.file as needed for planning. Drafts exceeding applicable word limits are organized without expansion; resolve conflicts in favor of global facts. Preserve original tables and images; following table and illustration restrictions apply only to new content. Reference copied originals directly without regenerating them. Sections without drafts follow the normal flow.' : ''}
4. Read the complete 配图类型对照表.md and image_requirements, and inspect image_layout_quota: total_groups is the total, while single, imageText, threeImages and fourImages are separate group quotas. Allocate layouts across targets with image_needed=true using subject, writing focus and suitability score; ${hasAi ? 'follow this run’s AI-image percentage requirement and ' : ''}plan each image’s purpose, type and generation method before parallel writing. ${hasAi ? 'For each AI image specify its type, subject, viewpoint and visual style, keeping variety across the document and within groups. ' : ''}Assign no images to zero quotas. Multiple groups may be assigned to suitable sections; do not distribute evenly by default or exchange quotas among layout types. On pause or retry, retain this run’s quotas and completed layouts; fill only missing work without reallocating the whole run. After retrieving needed references and planning, write ${taskFilePath('sections')} as {"sections":[{"section_id":"target section id","instructions":"additional requirements","references":"supplementary excerpts"}]}. Each item must include all three fields. Copy section_id exactly from targets; use an empty string for references when no excerpt is needed. Call generate-sections: the program reads all entries and the AI queue handles concurrency and automatically starts queued work. Existing sections are skipped; set "regenerate": true only when a full rewrite is necessary. On resume or retry submit again after correcting failed requirements. Task files in 任务/ have preconfigured schemas; json-validation is available for self-check, and tools validate on submission. Write the file before calling the corresponding tool. The tool supplies saved section plans, project overview, HTML rules, templates, illustration guide, word and image requirements. Do not rewrite each section’s focus or detailed outline; the writing model organizes paragraphs from the saved plan. instructions should include only assigned layout, group counts, each image’s purpose, type and method${generationNote}${hasAi ? ', plus AI image type, subject, viewpoint and style' : ''}, and truly necessary special requirements. Do not repeat target words, focus, table plans, facts or common formatting, or write image tags, attributes, IDs or full image prompts; the writing model handles these according to the rules. Use an empty instructions string when there are no new images or additional requirements; existing original images remain governed by their own rules. references contains only needed supplementary excerpts. Verify and supply targeted corrections for concrete problems; retries should describe only what must be fixed. The main agent coordinates global quotas; parallel tasks must not independently allocate or assume batch quotas. Respect the configured text concurrency; never call external models directly with bash or scripts.
5. After body layouts are saved, call list-section-images. It returns a summary and writes the complete inventory, including section, figure, method, ratio, prompt and reference, to 程序清单/正文图片清单.json. Complete required image generation, repair failures and update body image references while preserving valid work. Decide how to read, organize, batch and submit inventory and source; incremental reads and submissions are allowed. Fix structure or prompt problems with read/edit and re-extract by section_ids. Preserve image_id exactly for image and apply tools. Reuse reused_original=true images; repair missing original references instead of regenerating. Do not regenerate valid images. Read the complete 配图类型对照表.md before image work and follow image_requirements. In no-image mode add no images or placeholders and call no image tool. Otherwise use assigned layouts and individually chosen methods from the guide. Layout alone does not determine the method; not every available method must be used. ${mainImageToolSteps(imageKinds)}
6. ${resuming ? 'This continues the existing session. Inspect completed files in 正文/, preserve valid body text, images and source, reuse matching valid references, and complete only unfinished, failed or explicitly incorrect sections and images.' : 'Save each section as an independent HTML file under 正文/.'} The tool reports counts and failures. Correct failed requirements and retry; inspect or fix existing HTML using read/edit. Do not delete completed sections. Section id is stable identity; number is display numbering. Use id for section_id, result manifests and filenames; never derive paths from display numbering.
7. Once all parallel generation and image work finishes, call list-section-images again. Use summary to check new layout groups against quotas and confirm captions and references, then check generation method distribution against image_requirements${hasAi ? ' and image diversity; the AI percentage is a planning goal and deviations do not create an extra failure condition or require additional images' : ''}. Original images and layouts do not consume new quotas${hasAi ? ' or count toward the AI percentage' : ''}. Then call check-word-count once for actual counts; do not adjust incrementally using partial results. The tool returns total and limits and writes section counts to 程序清单/正文字数统计.json. After all checks, enter image protection: prefer edit for text, optionally use bash, but do not call content or image generation tools again. Do not change any inserted image blocks (including originals, new images, captions and prompts), image order or image table layouts; ordinary descriptive text in imageText tables may be edited. The program checks each section’s image blocks at submission and returns originals for exact restoration if changed. At this stage count words only: keep body content unchanged after counting, including no scripted bulk deletions or edits to meet word targets. Report results faithfully; the program handles word requirements after submission.
8. Check section coverage and counts and verify that each img data-sv-asset-ref points to an existing image file. When image placeholders are complete, write all current targets to 正文生成结果.json as {"sections":[{"section_id":"section id","file":"正文/section-id.html","words":actualWordCount}]}; section counts are in 程序清单/正文字数统计.json. The JSON has a predefined schema and may be checked with json-validation or written in multiple parts. Body content is saved only in each section’s HTML. The manifest records only section ID, file path and actual word count. Once generation, adjustments and checks finish, set task_complete=true on the final manifest write or update and accurately submit the current artifacts and word counts. The program validates the manifest, HTML, image references and blocks, and restores altered inputs and non-target sections. On failure it returns issues (full list in 程序清单/提交校验问题.json). If more than ${SUBMISSION_FIX_PARALLEL_THRESHOLD} sections have issues, call ${SUBMISSION_FIX_TOOL} for parallel repair; otherwise fix directly. Repair and resubmit as instructed. The program decides whether to keep repairing, change methods or accept residual quality issues; it stops only if blocking issues persist after the minimum-goal repair.
9. After this stage is submitted, the program issues the consistency audit in the same session. Wait for the next stage; do not convert Word yourself.
The following writing rules apply only to section HTML, not to the result manifest:\n${writingInstructions(hasKnowledgeBase)}`;
}

// Initial planning, content, and postprocessing share one primary call; after pausing, resume from the persistent session and saved stage.
// Content stages reuse the persistent session; export repair only appends instructions and does not trigger acceptance checks or later stages.
async function runContentGenerationAgent({ agentService, aiService, generationOptions = {}, resume, exportRepair, sections = [], hasKnowledgeBase, hasOriginalPlan, resolveOriginalImagePath,
  signal, planning, prepareGeneration, buildFiles, checkLayout, onLayoutProgress = () => {}, onCheckpoint = () => {}, onActivity, onProgress,
  onWordAdjustProgress = () => {}, onConsistencyProgress = () => {}, onTableCleanupProgress = () => {}, onWorkspaceReady = () => {}, failTask = () => {} }) {
  const reuseSession = agentService.hasPersistentTaskSession(CONTENT_GENERATION_AGENT_TASK_KEY);
  const persistent = reuseSession ? agentService.loadPersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY) : null;
  const persistentState = persistent?.state || {};
  // Tools, task schemas, and prompts cover only enabled illustration methods.
  const imageKinds = resolveImageKinds(generationOptions);
  if (exportRepair) {
    if (!reuseSession) throw new Error('原正文 Agent 会话不存在，无法执行导出修复');
    const runId = crypto.randomUUID();
    const prompted = resume && wasStagePrompted(persistentState, 'export-repair');
    agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, {
      run_id: runId, status: 'running', phase: 'export-repair', agent_connection: 'running', error: null,
      ...(!resume ? { prompted_stage: null } : {}),
    });
    return agentService.runTask({
      task_id: runId, title: '投标文件正文导出修复', primary_session: true, summary_enabled: false,
      persistent_task: { task_key: CONTENT_GENERATION_AGENT_TASK_KEY, mode: 'resume' },
      initial_stage: 'export-repair', output_file: RESULT_FILE,
      prompt: prompted ? CONTINUE_PROMPT : exportRepair, signal,
      max_retries: 0, timeout_ms: 30 * 60 * 1000,
      json_validation_schemas: taskFileSchemas(undefined, undefined, imageKinds),
      active_tools: [...NATIVE_AGENT_TOOLS, 'ask-user', 'report-failure', ...imageToolNames(imageKinds)],
      // Allow editing content registered by earlier stages, or Runtime cleanup will undo this repair.
      create_tools(context) {
        context.baseline?.release(BASELINE_GROUPS.sections, sections.map(section => section.file));
        return createContentGenerationImageTools({
          aiService, signal, sections, onActivity, failTask, imageKinds,
          htmlImageOptimization: generationOptions.htmlImageOptimization === true,
        }, context);
      },
      onCheckpoint: checkpoint => onCheckpoint({ ...checkpoint, task_key: CONTENT_GENERATION_AGENT_TASK_KEY, run_id: runId }),
      onActivity,
    });
  }
  const planningHandoff = Boolean(planning) || ['content-planning', 'restoring'].includes(persistentState.phase);
  const resuming = Boolean(resume && reuseSession && !planningHandoff);
  // Resuming paused or failed planning within the same round is not a new task round.
  const continuingPlanning = Boolean(planning?.continuing);
  const savedState = resuming ? persistentState : {};
  const wordAdjustmentEnabled = generationOptions.wordCountRepair === true;
  const protectionActive = savedState.word_adjustment_started === true;
  let consistencyState = savedState.consistency || null;
  let tableCleanupState = savedState.table_cleanup || null;
  let layoutState = savedState.layout_check || null;
  let wordAdjustState = savedState.word_adjust || null;
  let stage = planning ? 'content-planning' : layoutState ? 'layout-checking' : tableCleanupState ? 'table-cleaning' : consistencyState ? 'auditing' : wordAdjustState ? 'word-adjusting' : 'generating';
  let toolContext;
  let imageProtection;
  let generationTools;
  let runSummary;
  const localContext = { signal, onActivity, workspace_dir: persistent?.paths?.workspaceDir };
  const currentWorkspaceDir = () => toolContext?.workspaceDir || localContext.workspace_dir;
  const consistency = { get: () => consistencyState, save(state) {
    consistencyState = state;
    agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { consistency: state });
    onConsistencyProgress(state);
  } };
  const tableCleanup = { get: () => tableCleanupState, save(state) {
    tableCleanupState = state;
    agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { table_cleanup: state });
    onTableCleanupProgress(state);
  } };
  const layout = { get: () => layoutState, save(state) {
    layoutState = state;
    stage = 'layout-checking';
    agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { layout_check: state, phase: stage });
    onLayoutProgress(state);
  } };
  const wordAdjust = { get: () => wordAdjustState, save(state) {
    wordAdjustState = state;
    agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { word_adjust: state });
    onWordAdjustProgress(state);
  } };
  // Pass a stable protection entry point during registration; update actual rules after stage transitions.
  const protection = {
    get active() { return Boolean(imageProtection?.active); },
    enter: names => imageProtection.enter(names),
    beforeToolCall: context => imageProtection.beforeToolCall(context),
    recorded: file => imageProtection?.recorded(file) || null,
  };
  // Repair tools follow current stage rules: compare image blocks after protection, and check unaccepted remaining tables after entering cleanup.
  const submissionOptions = () => ({ imageProtection: protection, requireNoDataTables: Boolean(tableCleanupState),
    acceptedTableSectionIds: tableCleanupState?.remaining_section_ids || [] });
  const planningTools = [...NATIVE_AGENT_TOOLS, 'json-validation', 'ask-user', 'report-failure'];
  const generationToolNames = () => [...planningTools, ...generationTools.map(tool => tool.name)];
  const prepareFiles = context => prepareGeneration ? prepareGeneration(context) : buildFiles();
  // Inline only the execution summary at handoff; the agent reads target planning and other lists from the manifest as needed.
  function prepareRunSummary(files) {
    runSummary = buildRunSummary(JSON.parse(files.find(file => file.path === INPUT_FILES.decisions).content));
  }
  // Establish target and image protection only after content inputs are saved; image records cover all current target sections.
  function initializeContent() {
    const { workspaceDir, baseline } = toolContext;
    const decisions = JSON.parse(fs.readFileSync(path.join(workspaceDir, INPUT_FILES.decisions), 'utf8'));
    const isLayout = stage === 'layout-checking';
    imageProtection = createContentImageProtection({
      workspaceDir, files: decisions.targets.map(section => section.file), baseline,
      active: isLayout || protectionActive || Boolean(consistencyState) || Boolean(tableCleanupState) || Boolean(wordAdjustState),
      ...(isLayout ? { toolNames: LAYOUT_TOOLS } : tableCleanupState ? { toolNames: TABLE_CLEANUP_TOOLS } : consistencyState ? { toolNames: CONSISTENCY_TOOLS } : wordAdjustState ? { toolNames: WORD_ADJUST_TOOLS } : {}),
      setActiveTools: names => toolContext.setActiveTools?.(names),
      onEnter: () => agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { word_adjustment_started: true }),
    });
    if (isLayout) return;
    // On entering generation for a new round, allow the agent to generate and edit current targets while keeping other existing sections protected.
    if (!resuming) baseline?.release(BASELINE_GROUPS.sections, decisions.targets.map(section => section.file));
    if (!resuming && hasOriginalPlan) {
      const copied = copyRestoredImages(workspaceDir, resolveOriginalImagePath);
      baseline?.setGroup(BASELINE_GROUPS.originalImages, copied);
    }
    if (!protectionActive && !consistencyState && !tableCleanupState && !wordAdjustState) toolContext.setActiveTools?.(generationToolNames());
    onWorkspaceReady(workspaceDir);
    if (tableCleanupState) onTableCleanupProgress(tableCleanupState);
    else if (consistencyState) onConsistencyProgress(consistencyState);
  }
  function next(nextStage, prompt, compaction) {
    stage = nextStage;
    return { stage, prompt, ...(compaction ? {
      compact_before_prompt: true, compaction_optional: true, compaction_stage: `${nextStage}-compaction`,
      compaction_message: '正在压缩上下文', compaction_complete_message: '上下文压缩完成', compaction_instructions: compaction,
    } : {}) };
  }
  // Compact history before later stages with heavy reading/writing; workspace files remain authoritative and summaries retain only workflow conclusions.
  function compactionInstructions(nextStageName) {
    return `请用简体中文总结，供下一阶段「${nextStageName}」继续使用。保留：本轮目标小节范围及正文、图片文件的位置约定；各阶段已完成情况和程序反馈的结论；已确定的统一事实口径；尚未解决的问题、失败或待重试的小节及原因。正文、图片和台账以工作区文件为准，不在摘要中摘录正文、HTML 或台账原文，也不复述已结束阶段的操作细节。`;
  }
  const consistencyPrompt = workspaceDir => buildConsistencyPrompt(consistencyState, { hasKnowledgeBase, workspaceDir });
  const createAuditState = () => ({ status: 'extracting', extract_completed: 0, extract_total: 0, remaining_issues: [], failed_sections: [], summary: '', submission: null });
  // Concurrent section checks are programmatic: reuse unchanged results by content hash during checking; when resuming repair, fill only missing sections without rechecking edits.
  // Individual check failures do not interrupt the audit; record reasons in the ledger for the primary agent to recheck or inspect manually.
  async function extractLedger(context) {
    const extractSignal = context.signal || signal;
    const ledger = await extractConsistencyLedger({ aiService, workspaceDir: context.workspace_dir, signal: extractSignal, onActivity: context.onActivity || onActivity,
      checkChanges: consistencyState.status !== 'running',
      onProgress: (completed, total) => consistency.save({ ...consistencyState, extract_completed: completed, extract_total: total }) });
    extractSignal.throwIfAborted();
    const failed = Object.keys(ledger.failures).length;
    if (failed) (context.onActivity || onActivity)?.({ message: `${failed} 个小节一致性核对失败，已写入台账交由主 Agent 重新核对或自行核对。` });
    protectLedger(context.baseline, context.workspace_dir);
    consistency.save({ ...consistencyState, status: 'running' });
  }
  function generationPrompt() {
    // Resumes do not rewrite input snapshots; derive the summary from the existing workspace manifest.
    runSummary ||= buildRunSummary(JSON.parse(fs.readFileSync(path.join(currentWorkspaceDir(), INPUT_FILES.decisions), 'utf8')));
    return `${reuseSession && !resuming && !planningHandoff ? '本次为目录变更后的局部生成任务，在原会话中执行。重新读取已更新的输入文件，仅对当前 targets 执行生成和审计修复；本轮完成状态根据当前目标重新确认，不沿用上一轮的完成结论。保留其他小节的 HTML、图片及源码，新增配图源码使用新文件名，不覆盖已有文件。\n' : ''}${buildContentGenerationPrompt(resuming, hasKnowledgeBase, hasOriginalPlan, runSummary, planningHandoff, imageKinds)}`;
  }
  // Accept the current stage using one shared artifact read; stage checks aggregate issues without managing repair counts.
  function validateContentStageSubmission(workspaceDir) {
    const inspected = inspectContentArtifacts(workspaceDir, { imageProtection: protection });
    const issues = [...inspected.issues];
    if (stage === 'auditing') {
      issues.push(...collectConsistencySubmissionIssues(workspaceDir, consistencyState));
    } else if (stage === 'table-cleaning' && (tableCleanupState.submission || tableCleanupState.status === 'completed')) {
      issues.push(...collectTableSubmissionIssues(inspected.inspections, tableCleanupState.remaining_section_ids));
    }
    if (stage !== 'table-cleaning' && tableCleanupState?.status === 'completed') {
      issues.push(...collectTableSubmissionIssues(inspected.inspections, tableCleanupState.remaining_section_ids));
    }
    return {
      value: inspected.result, issues,
      minimumGoal: '结果清单是有效 JSON，覆盖本轮全部目标小节；正文完整且可转换为 Word，必要图片引用和受保护图片块有效。保留已有正文、原图和任务范围。',
    };
  }

  // Initial checks and rechecks are programmatic; call the primary model again only for explicit supplementation tasks.
  function finishLayout(context, result) {
    if (!checkLayout) return { complete: true };
    return (async () => {
      await checkLayout(result, layout, context);
      context.signal?.throwIfAborted();
      if (layoutState.status === 'supplementing') {
        stage = 'layout-checking';
        if (toolContext) initializeContent();
        return next(stage, buildLayoutPrompt(layoutState));
      }
      return { complete: true };
    })();
  }
  // After auditing, remove tables according to saved settings, then enter local layout checks.
  function finishConsistency(context, result) {
    const decisions = JSON.parse(fs.readFileSync(path.join(context.workspace_dir, INPUT_FILES.decisions), 'utf8'));
    if (decisions.table_requirement !== 'none') return finishLayout(context, result);
    tableCleanup.save({ status: 'running', section_ids: [], completed_section_ids: [], remaining_section_ids: [], remaining: [], failures: {}, submission: null });
    imageProtection.enter(TABLE_CLEANUP_TOOLS);
    return next('table-cleaning', buildTableCleanupPrompt(tableCleanupState));
  }

  onActivity?.(resuming ? { message: '正在恢复任务与输入资料' } : { progress: { step: 'preparing', label: planning ? '正在准备基础编排资料' : '正在准备正文输入资料' } });
  const files = planning ? planning.files : resuming ? [] : await prepareFiles(localContext);
  if (!planning && !resuming) prepareRunSummary(files);
  // Resume paused layout checks with programmatic work first; do not call the model just to skip completed supplementation.
  if (stage === 'layout-checking' && layoutState.status !== 'supplementing') {
    const restoredResult = readContentGenerationResult(localContext.workspace_dir);
    const continuation = await finishLayout(localContext, restoredResult);
    if (continuation.complete) {
      agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { status: 'success', phase: 'completed', agent_connection: 'idle', error: null });
      return restoredResult;
    }
  }
  const runId = crypto.randomUUID();
  // New rounds clear previous task files and program manifests; pause resumes and failure retries retain them.
  if (reuseSession && !resuming) clearTaskArtifacts(localContext.workspace_dir);
  // Clear the previous pause/failure error before resuming; record any new prerequisite-step failure accurately.
  // New rounds also clear prior stage-prompt records and pending compaction to avoid being mistaken for resumes.
  if (reuseSession) agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, {
    run_id: runId, status: 'running', phase: stage, agent_connection: 'running', error: null,
    ...(!resuming ? { word_adjustment_started: false, word_adjust: null, consistency: null, table_cleanup: null, layout_check: null } : {}),
    ...(!resuming && !continuingPlanning ? { prompted_stage: null, compaction_pending: null } : {}),
  });
  // Before resuming an audit, complete missing section checks and pass failed sections to the primary agent through the ledger.
  if (stage === 'auditing' && consistencyState.status !== 'completed') await extractLedger(localContext);
  // If stage instructions were already sent, send only the continuation instruction; completed audits or table cleanup still use programmatic wrap-up prompts.
  const stageFinished = (stage === 'auditing' && consistencyState?.status === 'completed')
    || (stage === 'table-cleaning' && tableCleanupState?.status === 'completed');
  const continuingStage = (resuming || continuingPlanning) && !stageFinished && wasStagePrompted(persistentState, stage);
  const result = await agentService.runTask({
    task_id: runId, title: '投标文件正文生成', primary_session: true, summary_enabled: false, fixed_tool_list: true,
    prompt: continuingStage ? CONTINUE_PROMPT : planning ? planning.prompt : layoutState ? buildLayoutPrompt(layoutState) : tableCleanupState ? buildTableCleanupPrompt(tableCleanupState) : consistencyState ? consistencyPrompt(localContext.workspace_dir) : wordAdjustState ? buildWordAdjustPrompt(wordAdjustState) : generationPrompt(),
    output_file: RESULT_FILE, files, signal,
    persistent_task: { task_key: CONTENT_GENERATION_AGENT_TASK_KEY, mode: reuseSession ? 'resume' : 'create' },
    initial_stage: stage, active_tools: planning ? planningTools : layoutState ? LAYOUT_TOOLS : undefined,
    prepare_output_files: planning ? [planning.outputFile] : [],
    max_retries: 1, timeout_ms: 30 * 60 * 1000,
    // Return the full issue description for submission failures; resume the original task directly for execution failures such as model/service interruptions.
    // Initial planning retains its no-automatic-retry execution policy; content generation still gets one continuation attempt.
    buildRetryPrompt: (request, meta) => {
      if (request.kind === 'execution') return stage === 'content-planning' ? null : CONTINUE_PROMPT;
      const issues = request.mode === 'minimum' ? request.report.issues.filter(item => item.severity === 'blocking') : request.report.issues;
      return '本次结果文件：' + (stage === 'content-planning' ? planning.outputFile : RESULT_FILE) + '。'
        + contentSubmissionInstructions(meta.workspace_dir, issues, protection.active)
        + ' 保留已完成内容，不重新执行已结束阶段；本轮处理后重新提交，由程序判断是否继续。';
    },
    json_validation_schemas: { [RESULT_FILE]: RESULT_SCHEMA, ...taskFileSchemas(undefined, undefined, imageKinds), ...(planning ? { [planning.outputFile]: planning.schema } : {}) },
    // Stage gates restrict business tools only; do not intercept file writes. Submission checks validate results and restore program files.
    before_tool_call: context => {
      if (stage === 'content-planning') {
        if (!planningTools.includes(context.toolCall.name)) throw new Error('基础编排尚未完成，请先提交编排结果');
      } else {
        // Word adjustment, table cleanup, and layout supplementation invoke only their stage tool; the program performs the work.
        const stageTool = ({ 'word-adjusting': WORD_ADJUST_TOOL, 'table-cleaning': TABLE_CLEANUP_TOOL, 'layout-checking': LAYOUT_TOOL })[stage];
        if (stageTool && ![stageTool, 'report-failure'].includes(context.toolCall.name)) throw new Error(`本阶段只调用 ${stageTool}，并在该调用上设置 task_complete=true；不要读取或修改正文。`);
        if (!tableCleanupState && consistencyState && consistencyState.status !== 'running' && context.toolCall.name === 'repair-sections') throw new Error('一致性审计结论已经提交，请标记任务完成并等待程序进入下一阶段');
        imageProtection.beforeToolCall(context);
      }
      const { name } = context.toolCall;
      const args = context.args || {};
      if (['read', 'edit', 'write', 'find', 'ls'].includes(name)) onActivity?.({ operation: name,
        message: `${({ read: '正在读取', edit: '正在修改', write: '正在保存', find: '正在查找', ls: '正在查看目录' })[name]}：${args.path || args.file_path || args.pattern || name}` });
    },
    create_tools: context => {
      toolContext = context;
      // Register all existing workspace sections at a new round's start and release current targets upon generation; resumes retain saved registrations.
      if (!resuming) context.baseline?.setGroup(BASELINE_GROUPS.sections, listSectionFiles(context.workspaceDir));
      // Refresh ledger protection after programmatic completion before audit resume.
      if (stage === 'auditing') protectLedger(context.baseline, context.workspaceDir);
      generationTools = createContentGenerationTools({ aiService, agentService, generationOptions, hasKnowledgeBase, signal, onProgress, onActivity, wordAdjust,
        imageProtection: protection, consistency, tableCleanup, submissionOptions, failTask }, context);
      const layoutTools = createContentGenerationLayoutTools({ aiService, signal, layout, onActivity, failTask }, context);
      if (stage !== 'content-planning') initializeContent();
      return [...generationTools, ...layoutTools];
    },
    validateOutput: (_result, context) => {
      if (stage === 'content-planning') {
        const file = path.join(context.workspace_dir, planning.outputFile);
        if (!fs.existsSync(file)) return { value: null, issues: [{ severity: 'blocking', file: planning.outputFile, message: planning.outputFile + ' 尚未生成，请按本阶段要求保存结果。' }] };
        return planning.validate(fs.readFileSync(file, 'utf8'));
      }
      onActivity?.({ progress: { step: 'result-check', label: '正在核对正文结果与当前阶段要求' } });
      const report = validateContentStageSubmission(context.workspace_dir);
      onActivity?.({ progress: { step: 'result-check', label: report.issues.length ? '结果核对发现 ' + report.issues.length + ' 处问题' : '正文结果核对完成', done: report.issues.length === 0 } });
      return report;
    },
    continueTask: (_result, context) => {
      if (stage === 'content-planning') return (async () => {
        await planning.complete(context.validation_result, context);
        const nextFiles = await prepareFiles(context);
        await context.writeFiles(nextFiles);
        prepareRunSummary(nextFiles);
        stage = 'generating';
        initializeContent();
        return next(stage, generationPrompt());
      })();
      const accepted = context.accepted_issues;
      const checked = context.validation_result;
      // Resend stage instructions if a single-tool stage ends without calling its tool; submitted tool results are the stage conclusion, with leftovers recorded by the tool.
      if (stage === 'layout-checking') {
        if (!layoutState.submission) return next(stage, buildLayoutPrompt(layoutState));
        layout.save({ ...layoutState, submission: null, status: 'rechecking' });
        return finishLayout(context, checked);
      }
      if (tableCleanupState) {
        if (tableCleanupState.status !== 'completed') {
          if (!tableCleanupState.submission) return next('table-cleaning', buildTableCleanupPrompt(tableCleanupState));
          tableCleanup.save({ ...tableCleanupState, submission: null, status: 'completed' });
        }
        return finishLayout(context, checked);
      }
      if (consistencyState) {
        if (consistencyState.status !== 'completed') {
          if (!consistencyState.submission) return next('auditing', CONTINUE_PROMPT);
          const submitted = consistencyState.submission;
          consistency.save({ ...consistencyState, ...submitted, submission: null, status: 'completed',
            remaining_issues: [...submitted.remaining_issues, ...accepted.map(item => item.message)] });
        }
        return finishConsistency(context, checked);
      }
      // Enter consistency auditing after word adjustment; compact context before auditing while checking section facts in parallel.
      const startAudit = () => {
        consistency.save(createAuditState());
        imageProtection.enter(CONSISTENCY_TOOLS);
        return { ...next('auditing', consistencyPrompt(context.workspace_dir), compactionInstructions('一致性审计')), await_before_prompt: extractLedger(context) };
      };
      if (stage === 'word-adjusting') {
        if (wordAdjustState.status !== 'completed') return next(stage, buildWordAdjustPrompt(wordAdjustState));
        return startAudit();
      }
      const decisions = JSON.parse(fs.readFileSync(path.join(context.workspace_dir, INPUT_FILES.decisions), 'utf8'));
      const targetWords = decisions.targets.reduce((sum, section) => sum + (section.content_plan?.target_words || 0), 0);
      const totalWords = checked.sections.reduce((sum, section) => sum + section.words, 0);
      // When word repair is enabled and totals fall outside the required range, enter centralized tool-based adjustment; the primary agent only counts words.
      const plan = wordAdjustmentEnabled ? planWordAdjustment(context.workspace_dir) : null;
      const adjusting = Boolean(plan?.jobs.length);
      onActivity?.({ message: '首次正文生成：本轮目标 ' + (targetWords || '未设置') + ' 字，实际 ' + totalWords + ' 字；'
        + (adjusting ? `进入字数校正，按字数要求改写 ${plan.jobs.length} 个小节。` : (plan ? '没有可调整的小节，保留字数偏差，' : wordAdjustmentEnabled ? '' : '未开启字数修复，') + '进入一致性审计。') });
      if (!adjusting) return startAudit();
      // Record image protection first for comparison during word adjustment and auditing; do not compact context for word adjustment.
      imageProtection.enter(WORD_ADJUST_TOOLS);
      wordAdjust.save(createWordAdjustState(plan));
      return next('word-adjusting', buildWordAdjustPrompt(wordAdjustState));
    },
    onCheckpoint: checkpoint => onCheckpoint({ ...checkpoint, task_key: CONTENT_GENERATION_AGENT_TASK_KEY, run_id: runId }),
    onActivity,
  });
  signal.throwIfAborted();
  return result.validation_result;
}

module.exports = { buildContentGenerationPrompt, wordInstructions, globalFactsInstructions, imageInstructions, writingInstructions, CONTENT_GENERATION_AGENT_TASK_KEY, CONTINUE_PROMPT, wasStagePrompted, BASELINE_GROUPS, listSectionFiles, buildContentGenerationFiles, createContentGenerationTools, runContentGenerationAgent, readContentGenerationResult, inspectSectionArtifact, inspectContentArtifacts, checkSectionHtml };
