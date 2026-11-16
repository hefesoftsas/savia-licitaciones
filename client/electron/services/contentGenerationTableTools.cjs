const { normalizeSaviaMarkup } = require('../utils/saviaMarkup.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { load } = require('cheerio');
const { extractAiSource } = require('../utils/aiSourceExtraction.cjs');
const { findHtmlStructureIssues } = require('../utils/htmlStructure.cjs');
const { AI_UPSTREAM_UNAVAILABLE } = require('../utils/aiBatchGuard.cjs');
const { runAiBatch, requestWithFollowUp, topLevelNodes, spliceHtml, collectIds, uniqueId, writeHtml } = require('./contentGenerationAiBatch.cjs');
const { sharedPrefixMessages } = require('../utils/promptPrefixCache.cjs');

const TABLE_CLEANUP_TOOL = 'remove-section-tables';
// During table cleanup, the primary agent calls only the table-removal tool.
const TABLE_CLEANUP_TOOLS = [TABLE_CLEANUP_TOOL, 'report-failure'];
const IMAGE_TABLE_PRESETS = ['imageText', 'threeImages', 'fourImages'];
const NUMBER_PATTERN = /\d+(?:\.\d+)?%?/g;

// Image tables are illustration layouts and are excluded from data-table cleanup.
function hasDataTables(html) {
  const $ = load(normalizeSaviaMarkup(html), null, false);
  return $('table').toArray().some(node => !IMAGE_TABLE_PRESETS.includes($(node).attr('data-sv-preset')));
}

// Stage prompts only instruct the tool call; the tool locates, converts, verifies, and writes content.
function buildTableCleanupPrompt(state) {
  if (state.submission || state.status === 'completed') return `Table removal is complete. Call ${TABLE_CLEANUP_TOOL} to read the result and set task_complete=true on that call. Do not read or modify the body or call other tools.`;
  return `The consistency audit is complete and the user chose no tables. Call ${TABLE_CLEANUP_TOOL} and set task_complete=true on that call. The program finds all data tables in the current target sections, converts each to paragraphs or lists and checks numbers; image tables are preserved. Do not read or modify the body or call other tools. This stage ends after the tool returns; the program then checks layout. If the tool fails, retry according to its error.`;
}

// Full-width digits and thousands separators do not affect numeric verification.
function normalizeNumbers(text) {
  return String(text).replace(/[０-９．％]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0)).replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
}
// Extract text node by node: Cheerio text() concatenates adjacent cells, list items, paragraphs, and scripts, turning separate 10 and 20 into 1020.
function textNodes(nodes) {
  const texts = [];
  const visit = node => {
    if (node.type === 'text') texts.push(node.data);
    else for (const child of node.children || []) visit(child);
  };
  nodes.forEach(visit);
  return texts;
}
// Use the same method for source and converted tables: extract numbers from each text node, then combine.
function numbersOf(html) {
  const nodes = load(html, null, false).root().contents().toArray();
  return [...new Set(textNodes(nodes).flatMap(text => normalizeNumbers(text).match(NUMBER_PATTERN) || []))];
}
// Context text for the model separates nodes with spaces to avoid joining words.
const readableText = node => textNodes([node]).join(' ').replace(/\s+/g, ' ').trim();

// Top-level data tables to convert and reasons conversion may be unsafe; do not convert image-containing or nested data tables.
function scanTables(html) {
  const { $, nodes } = topLevelNodes(html);
  const isData = node => !IMAGE_TABLE_PRESETS.includes($(node).attr('data-sv-preset'));
  const tables = [];
  const skipped = [];
  const elements = nodes.filter(item => item.kind === 'element');
  elements.forEach((item, index) => {
    if (item.node.name === 'table' && isData(item.node)) {
      const source = html.slice(item.start, item.end);
      if ($(item.node).find('figure, img').length) skipped.push('表格单元格内含图片');
      else tables.push({ id: $(item.node).attr('id') || '', source, preceding: index > 0 ? readableText(elements[index - 1].node).slice(-300) : '' });
    } else if ($(item.node).find('table').toArray().some(isData)) skipped.push('表格不在顶层');
  });
  return { tables, skipped };
}

const tableKey = (sectionId, table) => `${sectionId}:${table.id || crypto.createHash('sha256').update(table.source).digest('hex').slice(0, 16)}`;

// Put round-wide conversion rules in system to reuse prefix caches for concurrent requests.
const CONVERT_SYSTEM = `Convert one data table from the bid document into restricted HTML paragraphs or lists to meet the requirement for a document without tables.
Make the relationship of every value to its row and column headers clear. Preserve the meaning of the table title, every value, unit, condition, note and commitment; keep Arabic numerals unchanged. Change only the form of expression, without adding or removing information or unrelated rewriting.
At the top level use only p, ul and ol; inline tags such as strong, em, sup and sub are allowed. Do not use tables, images, headings, Markdown, code fences or LaTeX. Do not add ids or <!-- savia:block --> separator comments. Close every non-void element.
Output only the converted HTML, in the language of the source.`;

// Validate conversion and return top-level blocks ready for reinsertion; explain invalid structure or missing source numbers.
function parseConversion(reply, numbers) {
  const source = extractAiSource(reply, 'html').trim();
  const issues = findHtmlStructureIssues(source);
  if (issues.length) throw new Error(`HTML 结构不完整：${issues.slice(0, 3).join('；')}`);
  const $ = load(source, null, false);
  const elements = $.root().children().toArray();
  if (!elements.length) throw new Error('没有输出段落或列表');
  if (elements.some(element => !['p', 'ul', 'ol'].includes(element.name))) throw new Error('顶层只能使用 p、ul 或 ol');
  if ($('table, figure, img').length) throw new Error('转换结果不能包含表格或图片');
  if ($.root().contents().toArray().some(node => node.type === 'text' && node.data.trim())) throw new Error('段落和列表之外不能有文字');
  const present = new Set(numbersOf(source));
  const missing = numbers.filter(value => !present.has(value));
  if (missing.length) return { feedback: `转换结果缺少原表中的数值：${missing.join('、')}。请保留原表全部数值、单位和条件，重新输出完整转换结果。`, reason: `转换后缺少原表数值 ${missing.join('、')}` };
  return { accept: true, value: elements.map(element => $.html(element)) };
}

// Convert tables programmatically and write to the workspace; state provides get/save, and resumes skip converted tables whose original source is no longer present.
async function removeDataTables({ aiService, workspaceDir, signal, onActivity, state }) {
  let current = state.get();
  const save = next => {
    current = next;
    state.save(current);
  };
  const decisions = JSON.parse(fs.readFileSync(path.join(workspaceDir, '正文编排决策.json'), 'utf8'));
  const targets = decisions.targets;
  const read = section => normalizeSaviaMarkup(fs.readFileSync(path.join(workspaceDir, section.file), 'utf8'));
  // Do not retry unusable table results; retry upstream request failures on resume.
  const failures = { ...current.failures };
  for (const [key, failure] of Object.entries(failures)) if (failure.retry) delete failures[key];
  const scans = new Map(targets.map(section => [section.id, scanTables(read(section))]));
  const sectionIds = targets.filter(section => scans.get(section.id).tables.length || scans.get(section.id).skipped.length).map(section => section.id);
  save({ ...current, section_ids: [...new Set([...current.section_ids, ...sectionIds])], failures });
  const jobs = targets.flatMap(section => scans.get(section.id).tables
    .map(table => ({ section, table, key: tableKey(section.id, table) }))
    .filter(job => !current.failures[job.key]));
  const pendingBySection = new Map();
  for (const job of jobs) pendingBySection.set(job.section.id, (pendingBySection.get(job.section.id) || 0) + 1);
  const report = (items, extra = {}) => onActivity?.({ progress: { step: 'table-repair', label: '正在转换数据表格', unit: '节', total: current.section_ids.length, items, ...extra } });
  report(current.section_ids.map(id => ({ id, status: pendingBySection.has(id) ? 'pending' : 'success' })));
  const failedSections = new Set();
  // Update section progress after all its tables are processed; count sections complete only when all conversions succeed.
  const settle = (job, status) => {
    if (status === 'error') failedSections.add(job.section.id);
    const left = pendingBySection.get(job.section.id) - 1;
    pendingBySection.set(job.section.id, left);
    if (left) return;
    const failed = failedSections.has(job.section.id) || scans.get(job.section.id).skipped.length > 0;
    if (!failed) save({ ...current, completed_section_ids: [...new Set([...current.completed_section_ids, job.section.id])] });
    report([{ id: job.section.id, status: failed ? 'error' : 'success' }]);
  };
  await runAiBatch({
    items: jobs, signal,
    async run(job, guard) {
      report([{ id: job.section.id, status: 'running' }]);
      const blocks = await requestWithFollowUp({
        aiService, guard, logTitle: `去表格-${job.section.number}-${job.section.title}`,
        // Assemble messages as in other batches; this tool has no shared material and does not warm the prefix.
        messages: sharedPrefixMessages(CONVERT_SYSTEM, '', `Section: ${job.section.number} ${job.section.title}\nPreceding text: ${job.table.preceding || 'None'}\n\nTable to convert:\n${job.table.source}`),
        evaluate: reply => parseConversion(reply, numbersOf(job.table.source)),
      });
      guard.signal.throwIfAborted();
      // Reread the section before writing because other tables may already be updated; locate the original table source and replace its whole block, preserving everything else.
      const file = path.join(workspaceDir, job.section.file);
      const html = normalizeSaviaMarkup(fs.readFileSync(file, 'utf8'));
      const start = html.indexOf(job.table.source);
      if (start < 0) throw new Error('原表格在转换期间已变化，未写回');
      const used = collectIds(load(html, null, false));
      const base = job.table.id || `${job.section.number.replace(/\W+/g, '_')}_tbl`;
      const $ = load('', null, false);
      const text = blocks.map((block, index) => {
        const element = $(block);
        element.attr('id', uniqueId(`${base}_c${index + 1}`, used));
        return $.html(element);
      }).join('\n\n<!-- savia:block -->\n');
      writeHtml(file, spliceHtml(html, [{ start, end: start + job.table.source.length, text }]));
      settle(job, 'success');
    },
    onError(job, error, { cancelled }) {
      if (cancelled) {
        report([{ id: job.section.id, status: 'cancelled' }]);
        return;
      }
      save({ ...current, failures: { ...current.failures, [job.key]: { section_id: job.section.id, reason: `${error?.message || error}`, retry: error?.isAiRequestError === true } } });
      settle(job, 'error');
    },
  });
  // Recheck files at round end: sections without data tables are complete; record remaining tables and reasons as unresolved.
  const remaining = [];
  const completed = [];
  for (const section of targets.filter(item => current.section_ids.includes(item.id))) {
    const { tables, skipped } = scanTables(read(section));
    if (!tables.length && !skipped.length) {
      completed.push(section.id);
      continue;
    }
    const reasons = [...skipped, ...tables.map(table => current.failures[tableKey(section.id, table)]?.reason || '转换未完成')];
    remaining.push({ section_id: section.id, number: section.number, title: section.title, reason: [...new Set(reasons)].join('；') });
  }
  save({ ...current, completed_section_ids: completed, remaining, remaining_section_ids: remaining.map(item => item.section_id), submission: {} });
  report([], { label: `去表格：转换 ${completed.length} 节${remaining.length ? `，${remaining.length} 节保留表格` : ''}`, done: true });
  return current;
}

// Tool results: processed section count and reasons for sections retaining tables.
function tableCleanupResult(state) {
  return { sections: state.section_ids.length, converted: state.completed_section_ids.length,
    remaining: state.remaining.map(({ number, title, reason }) => ({ number, title, reason })) };
}

// The only table-cleanup stage tool; submit results on completion so the main workflow enters layout checking.
function createContentGenerationTableTools({ aiService, signal, onActivity, tableCleanup, failTask = () => {} }, { Type, workspaceDir }) {
  return [{
    name: TABLE_CLEANUP_TOOL, label: '去除数据表格', executionMode: 'sequential',
    description: 'Call only during table removal. The program finds data tables in the target sections, converts each to paragraphs or lists, checks the values and writes the result back; image layout tables are retained. It returns results and reasons for sections that retain tables. Call only this tool in this stage and set task_complete=true on this call.',
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_callId, _params, toolSignal) {
      const state = tableCleanup.get();
      if (!state) throw new Error('当前不在去表格阶段');
      // Return saved results without reconversion when submitted or completed; resumes after layout-preparation failure return here to read those results.
      if (!state.submission && state.status !== 'completed') {
        try {
          await removeDataTables({ aiService, workspaceDir, signal: AbortSignal.any([signal, toolSignal].filter(Boolean)), onActivity, state: tableCleanup });
        } catch (error) {
          // End the whole task on consecutive upstream failures instead of repeated agent retries; resume conversion with remaining tables.
          if (error?.code === AI_UPSTREAM_UNAVAILABLE) failTask(error);
          throw error;
        }
      }
      const details = tableCleanupResult(tableCleanup.get());
      return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
    },
  }];
}

module.exports = { TABLE_CLEANUP_TOOL, TABLE_CLEANUP_TOOLS, hasDataTables, buildTableCleanupPrompt, createContentGenerationTableTools, removeDataTables, scanTables, numbersOf };
