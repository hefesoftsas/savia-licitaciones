const fs = require('node:fs');
const { NATIVE_AGENT_TOOLS } = require('./agent/agentToolEnvironment.cjs');
const path = require('node:path');
const { load } = require('cheerio');
const { LIST_DIR, LIST_FILES, compactResults } = require('./contentGenerationTaskFiles.cjs');

// The primary agent fixes submission-check section issues directly or concurrently through this tool.
const SUBMISSION_FIX_TOOL = 'fix-submission-issues';
// Repair concurrently when affected section count exceeds this threshold; otherwise the primary agent edits directly.
const SUBMISSION_FIX_PARALLEL_THRESHOLD = 5;
const SUBMISSION_ISSUES_FILE = `${LIST_DIR}/${LIST_FILES.submission}`;
const WORD_ADJUSTMENT_TOOLS = [...NATIVE_AGENT_TOOLS, 'json-validation', 'ask-user', 'check-word-count', SUBMISSION_FIX_TOOL, 'report-failure'];
const SECTION_EDIT_CHILD_TOOLS = [...NATIVE_AGENT_TOOLS, 'report-failure'];
// Save target image structures and original blocks in the task directory when protection begins, and reuse them after resume.
const IMAGE_RECORD = 'content-images';

// Extract images and their supporting structure only; ordinary explanatory table text is outside image protection.
function imageStructure(html) {
  const $ = load(String(html).replace(/\r\n/g, '\n'), null, false);
  // Templates contain a separate Document node; traverse the actual parent chain to detect images moved into invisible containers.
  function parents(node) {
    const result = [];
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.name) result.push(parent);
    }
    return result;
  }
  const images = $('figure, img').toArray().filter(node => !parents(node).some(parent => parent.name === 'figure'));
  const attributes = node => Object.fromEntries(Object.entries(node.attribs || {}).sort(([a], [b]) => a.localeCompare(b)));
  const tableTags = new Set(['table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
  // Preserve table layout and image cells; ignore ordinary text and its paragraph/list wrappers.
  function layout(node) {
    const imageIndex = images.indexOf(node);
    if (imageIndex >= 0) return [{ image: imageIndex }];
    const children = (node.children || []).flatMap(layout);
    return tableTags.has(node.name) ? [{ tag: node.name, attributes: attributes(node), children }] : children;
  }
  return JSON.stringify({
    images: images.map(node => ({
      html: $.html(node),
      parents: parents(node).map(parent => ({ tag: parent.name, attributes: attributes(parent) })),
    })),
    tables: $('table').toArray().filter(node => $(node).find('figure, img').length).map(layout),
  });
}

// Original image blocks for exact restoration: entire tables containing images, otherwise top-level figures or standalone images, in occurrence order.
function imageBlocks(html) {
  const $ = load(String(html).replace(/\r\n/g, '\n'), null, false);
  const blocks = [];
  for (const node of $('figure, img').toArray()) {
    if ($(node).parents('figure').length) continue;
    const table = $(node).parents('table').last();
    const block = table.length ? table[0] : node;
    if (!blocks.includes(block)) blocks.push(block);
  }
  return blocks.map(node => $.html(node));
}

// Record each file's current image structure and original image blocks; skip nonexistent files.
function captureImages(workspaceDir, files) {
  return Object.fromEntries(files.flatMap(file => {
    const target = path.join(workspaceDir, file);
    if (!fs.existsSync(target)) return [];
    const html = fs.readFileSync(target, 'utf8');
    return [[file, { structure: imageStructure(html), blocks: imageBlocks(html) }]];
  }));
}

// Format original image blocks as directly usable repair instructions.
function formatImageBlocks(blocks) {
  return blocks.length ? blocks.map((block, index) => `【原始图片块 ${index + 1}】\n${block}`).join('\n\n') : '本节原本没有图片块，删除新增的图片块。';
}

// During protection, stage gates restrict business tools only; compare content images to the baseline at submission instead of intercepting writes.
function createContentImageProtection({ workspaceDir, files = [], active = false, setActiveTools = () => {}, toolNames = WORD_ADJUSTMENT_TOOLS, onEnter = () => {}, baseline }) {
  function capture() {
    const value = captureImages(workspaceDir, files);
    baseline?.saveRecord(IMAGE_RECORD, value);
    return value;
  }
  // Protected task resumes reuse saved records; create missing records from current files for older tasks.
  let record = active ? baseline?.loadRecord(IMAGE_RECORD) || capture() : null;
  if (active) setActiveTools(toolNames);
  return {
    get active() {
      return active;
    },
    enter(names = toolNames) {
      if (!active) {
        onEnter();
        record = capture();
      }
      active = true;
      toolNames = names;
      setActiveTools(toolNames);
    },
    beforeToolCall({ toolCall }) {
      if (active && !toolNames.includes(toolCall.name)) throw new Error(`正文编辑期间不能调用 ${toolCall.name}，请只调整文字并保留图片。`);
    },
    // Return section image records after protection begins, otherwise null.
    recorded(file) {
      return active ? record?.[file] || null : null;
    },
  };
}

// Consistency and submission repairs share concurrent execution, native file tools, and error reporting.
// expectedImages specifies the section's image baseline; checks report usability only, while the parent stage manages repair rounds.
async function editContentSections({ jobs, targets, workspaceDir, agentService, signal, toolSignal, activity, inspectSection, onActivity, title, instructions, preserveDataTables = true, preloadInput = false, expectedImages, onResult = () => {} }) {
  const ids = jobs.map(section => section.section_id);
  if (new Set(ids).size !== ids.length || ids.some(id => !targets.has(id))) throw new Error('只能编辑本次目标小节，同一任务中不能重复出现同一小节');
  // Editing batches are exclusive per section: different sections may run concurrently, but two batches cannot edit the same section; tool entry points may still wait for all batches.
  activity.editing ||= new Set();
  const busy = ids.filter(id => activity.editing.has(id));
  if (busy.length) throw new Error(`以下小节正在其他批次中编辑，请等待结束后再提交：${busy.join('、')}`);
  const combinedSignal = AbortSignal.any([signal, toolSignal].filter(Boolean));
  const { global_facts_requirements: factsRequirements } = JSON.parse(fs.readFileSync(path.join(workspaceDir, '正文编排决策.json'), 'utf8'));
  const step = ({ '一致性修复': 'consistency-repair', '提交问题修复': 'submission-fix' })[title];
  // Agents dispatch editing tasks in batches with no known total; display cumulative completion rather than using dispatched count as denominator.
  const report = items => onActivity?.({ progress: { step, label: `正在${title}`, unit: '节', items, cumulative: true } });
  const readFile = file => {
    const target = path.join(workspaceDir, file);
    return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  };
  report(ids.map(id => ({ id, status: 'running' })));
  activity.pending += 1;
  for (const id of ids) activity.editing.add(id);
  // Children must not modify targets outside their batch that are not being edited elsewhere; compare with pre-dispatch snapshots afterward and restore changed files.
  const untouched = [...targets.values()].filter(section => !activity.editing.has(section.id))
    .map(section => ({ id: section.id, file: section.file, content: readFile(section.file) }));
  try {
    const results = await Promise.all(jobs.map(async job => {
      const section = targets.get(job.section_id);
      try {
        combinedSignal.throwIfAborted();
        const recorded = expectedImages ? expectedImages(section) : captureImages(workspaceDir, [section.file])[section.file] || null;
        // Read current files on every dispatch; provide full materials only for enabled tasks without reusing old snapshots.
        // Put shared batch rules and specifications first, followed by section tasks and content, to enable prefix caching across concurrent child sessions.
        const sharedInput = preloadInput
          ? `\n\n受限 HTML 生成规范（完整内容）：\n${fs.readFileSync(path.join(workspaceDir, '受限HTML生成规范.md'), 'utf8')}`
          : '';
        const sectionInput = preloadInput
          ? `\n\n本小节启动时的完整 HTML（${section.file}）：\n${fs.readFileSync(path.join(workspaceDir, section.file), 'utf8')}`
          : '';
        const readingInstructions = preloadInput
          ? '优先使用已提供的正文和规范直接修改，通常无需重复读取。需要核对最新内容、定位编辑位置或补充上下文时，可使用 grep、read 或 bash；修改后以最新文件为准。'
          : '阅读受限 HTML 规范，并根据本次任务读取目标正文；需要全文自查时分段覆盖，需要局部修改时先定位再读取相关上下文。优先使用 edit 保存修改，必要时可使用其他可用工具辅助处理。';
        await agentService.runTask({
          title: `${title}-${section.number}-${section.title}`, primary_session: false,
          failure_handled_by_parent: true,
          workspace_dir: workspaceDir, active_tools: SECTION_EDIT_CHILD_TOOLS,
          before_tool_call: context => {
            onActivity?.({ message: `${title}：${section.number} ${section.title}，${['edit', 'write', 'bash'].includes(context.toolCall.name) ? '正在修改' : '正在读取核对'}` });
          },
          output_file: section.file, summary_enabled: false, signal: combinedSignal,
          max_retries: 1, timeout_ms: 30 * 60 * 1000,
          prompt: `你负责编辑投标正文中的一个小节，执行${title}。具体小节、文件和本次要求见末尾“本次任务”。\n本项目事实缺失处理要求（仅适用于本任务允许补充的内容，不扩大本次编辑范围）：${factsRequirements}\n优先使用原生 edit 修改本次任务指定的小节文件，可按需使用 bash 处理工作区文件；不要改其他小节、输入资料或结果清单，程序会还原这些文件。已有图片块（含图注与提示词）、图片引用和顺序、图片表格布局不得删除、替换、复制、调序或修改；可以调整图文表格中的普通说明文字。编辑结束后程序检查本节结构、图片引用和图片块，问题交由主 Agent 统一处理。保留受限 HTML 结构并保持所有元素完整闭合，保留原有图片及引用、${preserveDataTables ? '原表格、' : '表格中的全部数据和含义、'}实质信息、事实参数和承诺。本次新增或改写的正文禁止使用 LaTeX 语法，包括 $...$、$$...$$、\\(...\\)、\\[...\\] 及 \\frac、\\text、\\circ 等命令。公式、参数和单位使用普通文字、Unicode 数学符号及受限 HTML 的 <sup>、<sub> 表达，例如 22 ℃ ± 2 ℃、40%～65%、≥30 m<sup>3</sup>/(h·人)。参考材料中的 LaTeX 在写入正文时也须转换为上述表达，保持数值、单位和含义不变。${instructions} 事实冲突以全局事实设定.md为准，按需读取。本次要求尚未完全达成时，保留真实正文并提交，由主 Agent 统一验收；只有无法继续执行的实际阻断才调用 report-failure。edit 返回文本未匹配等错误时，重新读取最新文件，依据实际原文修正编辑参数并重试。修改由当前子任务直接写入目标 HTML，不以返回补丁文本代替文件修改。完成本次编辑并核实真实结果后，在最后一次成功的 edit、bash 或 read 上标记 task_complete=true，不承担全文达标或修改其他小节的任务。${sharedInput}\n\n本次任务：\n你负责编辑小节 ${section.number} ${section.title}，文件为 ${section.file}。${readingInstructions}再按以下要求${title}：\n${job.instructions}${sectionInput}`,
          // Children resume execution exceptions only; artifact checks and repair decisions belong to the parent stage.
          buildRetryPrompt: (request, meta) => `上一轮小节编辑执行中断：${String(request.error?.message || request.error).slice(0, 12000)}\n在当前会话中继续处理 ${section.file}，保留已经完成的修改；完成本次编辑后标记 task_complete=true。这是第 ${meta.attempt}/${meta.max_retries} 次执行续接。`,
          onActivity,
        });
        combinedSignal.throwIfAborted();
        // Check current artifacts once after child delivery; do not start a submission-repair loop inside the child session.
        const inspected = inspectSection(section, { recordedImages: recorded, checkStructure: true });
        const result = { section_id: section.id, status: inspected.issues.length ? 'error' : 'success', facts: inspected.facts,
          ...(inspected.issues.length ? { issues: inspected.issues, error: inspected.issues.map(issue => issue.message).join('\n') } : {}) };
        report([{ id: section.id, status: result.status }]);
        onResult(result);
        return result;
      } catch (error) {
        report([{ id: section.id, status: combinedSignal.aborted ? 'cancelled' : 'error' }]);
        return { section_id: section.id, status: 'error', error: error.message };
      }
    }));
    combinedSignal.throwIfAborted();
    const restored = [];
    for (const { id, file, content } of untouched) {
      // Sections currently edited by batches started in the meantime are handled by those batches.
      if (activity.editing.has(id) || readFile(file) === content) continue;
      const target = path.join(workspaceDir, file);
      if (content === null) fs.rmSync(target, { force: true });
      else fs.writeFileSync(target, content, 'utf8');
      restored.push(file);
    }
    if (restored.length) onActivity?.({ message: `${title}：已还原 ${restored.length} 个本批以外被改动的小节` });
    return { results, restored };
  } finally {
    activity.pending -= 1;
    for (const id of ids) activity.editing.delete(id);
  }
}

// Batch-edit tool response text: statistics, unsuccessful items, and restored sections outside this batch.
function batchResponse(results, restored = [], extra = {}) {
  return { ...compactResults(results), ...(restored.length ? { restored_files: restored } : {}), ...extra };
}

// Convert the shared issue list into section-specific repair requirements.
function formatSectionIssues(issues) {
  return issues.map((item, index) => `${index + 1}. ${item.message}${item.original_image_blocks ? `。请把图片部分原样恢复为以下原始图片块，保留文字修改：\n${formatImageBlocks(item.original_image_blocks)}` : ''}`).join('\n');
}

// Repair submission issues concurrently by section; recheck latest files before dispatch and skip already-fixed sections.
// checkSection returns current issues; children cannot handle fixable=false issues such as missing content/images, so leave those to the primary agent.
// preserveDataTables sets this batch's table-retention requirement; children check artifact usability while the parent accepts quality goals.
function createSubmissionFixTool({ agentService, signal, activity, onActivity, inspectSection, readTargets, checkSection, expectedImages, structureRule, preserveDataTables = () => true }, { Type, workspaceDir }) {
  return {
    name: SUBMISSION_FIX_TOOL, label: '并发修复提交问题', executionMode: 'sequential',
    description: `提交校验退回的问题涉及超过 ${SUBMISSION_FIX_PARALLEL_THRESHOLD} 个小节时使用：读取 ${SUBMISSION_ISSUES_FILE} 中按小节记录的问题（HTML 结构、图片块等），每个小节交给一个子任务并发修复。派发前按最新文件复查，已修好的小节跳过；子任务获得本节完整 HTML、本节问题及需要恢复的原始图片块，完成后程序校验本节。正文或图片文件缺失等子任务无法处理的问题列在 unresolved 中，由你直接处理。返回 total、success、skipped 和 unresolved。`,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_callId, _params, toolSignal) {
      if (activity.pending) throw new Error('请等待上一批生成或编辑任务全部结束');
      const file = path.join(workspaceDir, SUBMISSION_ISSUES_FILE);
      if (!fs.existsSync(file)) throw new Error('当前没有待修复的提交校验问题');
      const targets = readTargets();
      const ids = [...new Set(JSON.parse(fs.readFileSync(file, 'utf8')).issues.map(item => item.section_id))].filter(id => targets.has(id));
      const jobs = [];
      const settled = new Map();
      for (const id of ids) {
        const issues = checkSection(targets.get(id));
        const manual = issues.filter(item => !item.fixable);
        if (!issues.length) settled.set(id, { section_id: id, status: 'skipped' });
        else if (manual.length) settled.set(id, { section_id: id, status: 'error', error: `子任务无法处理，请直接修复：${manual.map(item => item.message).join('；')}` });
        else jobs.push({ section_id: id, instructions: `修复程序提交校验发现的以下问题，只改与问题相关的内容：\n${formatSectionIssues(issues)}` });
      }
      const { results: edited, restored } = jobs.length ? await editContentSections({ jobs, targets, workspaceDir, agentService, signal, toolSignal, activity, inspectSection, onActivity,
        title: '提交问题修复', preloadInput: true, expectedImages, preserveDataTables: preserveDataTables(),
        instructions: `只修复本次列出的问题，不改写其他正文。${structureRule}`,
      }) : { results: [], restored: [] };
      const byId = new Map(edited.map(item => [item.section_id, item]));
      const results = ids.map(id => settled.get(id) || byId.get(id));
      return { content: [{ type: 'text', text: JSON.stringify(batchResponse(results, restored)) }], details: { results, restored } };
    },
  };
}

module.exports = {
  SUBMISSION_FIX_TOOL, SUBMISSION_FIX_PARALLEL_THRESHOLD, SUBMISSION_ISSUES_FILE, WORD_ADJUSTMENT_TOOLS,
  imageStructure, formatImageBlocks, createContentImageProtection, editContentSections, batchResponse, createSubmissionFixTool,
};
