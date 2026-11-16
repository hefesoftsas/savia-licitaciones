const fs = require('node:fs');
const path = require('node:path');
const { countReadableWords } = require('../utils/wordCount.cjs');
const { extractAiSource } = require('../utils/aiSourceExtraction.cjs');
const { AI_UPSTREAM_UNAVAILABLE } = require('../utils/aiBatchGuard.cjs');
const { warmPromptPrefix, sharedPrefixMessages } = require('../utils/promptPrefixCache.cjs');
const { runAiBatch, requestWithFollowUp, topLevelNodes, spliceHtml, writeHtml } = require('./contentGenerationAiBatch.cjs');

const LAYOUT_TOOL = 'supplement-layout-sections';
// During layout supplementation, the primary agent calls only the supplementation tool.
const LAYOUT_TOOLS = [LAYOUT_TOOL, 'report-failure'];
// Minimum supplementation words as a fraction of the suggestion; exceeding the suggestion pushes content onto the next page, so prefer fewer words.
const LAYOUT_MIN_RATIO = 0.7;

// Stage prompts only instruct the tool call; the tool locates, supplements, verifies, and writes content.
function buildLayoutPrompt(state) {
  if (state.submission) return `Layout supplementation is complete. Call ${LAYOUT_TOOL} to read the result and set task_complete=true on that call. Do not read or modify the body or call other tools.`;
  const gaps = state.jobs.reduce((sum, job) => sum + job.gaps.length, 0);
  return `Body generation, word adjustment, consistency audit and optional table removal are complete. The program exported Word using the current template and found ${gaps} gaps before images in ${state.jobs.length} sections. Call ${LAYOUT_TOOL} and set task_complete=true on that call. The tool locates images, generates supplementary paragraphs, checks word counts and writes changes. Do not read or modify the body or call other tools. This stage ends after the tool returns; the program then re-exports and checks the document. If the tool fails, retry according to its error.`;
}

const gapKey = (sectionId, gap) => `${sectionId}:${gap.figure_ids?.[0] || `block-${gap.block_index}`}`;
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Locate the post-gap image block by image ID, falling back to the checked top-level index if absent; derive the added paragraph ID from the block ID and skip if it exists.
function locateGap(html, gap) {
  const { $, nodes } = topLevelNodes(html);
  const elements = nodes.filter(item => item.kind === 'element');
  const figureId = gap.figure_ids?.[0];
  const hasImage = item => $(item.node).find('figure').addBack('figure').length > 0;
  let index = figureId ? elements.findIndex(item => $(item.node).find('figure').addBack('figure').toArray().some(figure => $(figure).attr('id') === figureId)) : -1;
  if (index < 0 && !figureId && elements[gap.block_index] && hasImage(elements[gap.block_index])) index = gap.block_index;
  if (index < 0) return null;
  const element = elements[index];
  const leadId = `${String($(element.node).attr('id') || figureId).slice(0, 59)}_lead`;
  const position = nodes.indexOf(element);
  const marker = nodes[position - 1]?.kind === 'marker' ? nodes[position - 1] : null;
  const preceding = elements.slice(0, index).filter(item => ['p', 'ul', 'ol'].includes(item.node.name)).slice(-2)
    .map(item => $(item.node).text().replace(/\s+/g, ' ').trim()).join('\n');
  return {
    leadId, inserted: $('[id]').toArray().some(node => $(node).attr('id') === leadId),
    insertAt: marker ? marker.start : element.start, preceding,
    caption: $(element.node).find('figcaption').map((_index, node) => $(node).text().trim()).get().join('；'),
  };
}

// Put round-wide supplementation rules in system to reuse prefix caches for concurrent requests.
const SUPPLEMENT_SYSTEM = `Write one transitional paragraph for the bid document immediately before the specified image to fill a layout gap.
Write coherent plain text that follows the preceding content and naturally introduces the image. Make it informative and directly relevant to the section title and writing focus; do not fill space with repetitive boilerplate. Do not add unsupported facts, figures or commitments. Handle information absent from the global facts according to the project's missing-facts instructions. Do not use headings, lists, Markdown, HTML or LaTeX.
For word counting, each Chinese character counts as one, each continuous sequence of English letters or digits counts as one, and punctuation and whitespace do not count. Stay within the requested range; prefer fewer words over too many.
Output only the paragraph, in the language of the proposal.`;

// Supplement each location and write to the workspace; state provides get/save, and resumes skip already inserted paragraphs.
async function supplementLayoutGaps({ aiService, workspaceDir, signal, onActivity, state }) {
  let current = state.get();
  const save = next => {
    current = next;
    state.save(current);
  };
  const decisions = JSON.parse(fs.readFileSync(path.join(workspaceDir, '正文编排决策.json'), 'utf8'));
  const targets = new Map(decisions.targets.map(section => [section.id, section]));
  const read = section => fs.readFileSync(path.join(workspaceDir, section.file), 'utf8');
  // Do not retry unusable outputs; retry upstream request failures on resume.
  const failures = { ...current.failures };
  for (const [key, failure] of Object.entries(failures)) if (failure.retry) delete failures[key];
  save({ ...current, failures });
  const items = current.jobs.flatMap(job => job.gaps.map(gap => ({ job, gap, section: targets.get(job.section_id), key: gapKey(job.section_id, gap) })))
    .filter(item => !current.failures[item.key] && !locateGap(read(item.section), item.gap)?.inserted);
  const pendingBySection = new Map();
  for (const item of items) pendingBySection.set(item.job.section_id, (pendingBySection.get(item.job.section_id) || 0) + 1);
  const report = (entries, extra = {}) => onActivity?.({ progress: { step: 'layout-supplement', label: '正在补写排版留白', unit: '节', total: current.jobs.length, items: entries, ...extra } });
  report(current.jobs.map(job => ({ id: job.section_id, status: pendingBySection.has(job.section_id) ? 'pending' : 'success' })));
  const failedSections = new Set();
  // Update a section's progress only after processing all its locations; count sections complete only when every supplementation succeeds.
  const settle = (item, status) => {
    if (status === 'error') failedSections.add(item.job.section_id);
    const left = pendingBySection.get(item.job.section_id) - 1;
    pendingBySection.set(item.job.section_id, left);
    if (left) return;
    const failed = failedSections.has(item.job.section_id);
    if (!failed) save({ ...current, completed_section_ids: [...new Set([...current.completed_section_ids, item.job.section_id])] });
    report([{ id: item.job.section_id, status: failed ? 'error' : 'success' }]);
  };
  const sharedInput = `Global facts (complete):\n${fs.readFileSync(path.join(workspaceDir, '全局事实设定.md'), 'utf8')}\n\nProject instructions for missing facts:\n${decisions.global_facts_requirements}`;
  if (items.length > 1) await warmPromptPrefix({ aiService, messages: sharedPrefixMessages(SUPPLEMENT_SYSTEM, sharedInput), signal, onActivity, logTitle: '格式补写-公共前缀预热', label: '格式补写公共材料' });
  await runAiBatch({
    items, signal,
    async run(item, guard) {
      report([{ id: item.job.section_id, status: 'running' }]);
      const located = locateGap(read(item.section), item.gap);
      if (!located) throw new Error('未找到对应的图片块');
      const maximum = item.gap.suggested_words;
      const minimum = Math.ceil(maximum * LAYOUT_MIN_RATIO);
      const text = await requestWithFollowUp({
        aiService, guard, logTitle: `格式补写-${item.section.number}-${item.section.title}`,
        messages: sharedPrefixMessages(SUPPLEMENT_SYSTEM, sharedInput, `Section: ${item.section.number} ${item.section.title} (${item.section.chapter_path || item.section.title})\nWriting focus: ${item.section.content_plan?.writing_focus || 'Not provided'}\nPreceding text:\n${located.preceding || 'None'}\nCaption of the following image: ${located.caption || 'None'}\nRequired length: ${minimum}–${maximum} words under the stated counting rules.`),
        evaluate(reply) {
          const content = extractAiSource(reply, 'text').replace(/\s*\n\s*/g, '').trim();
          if (!content) throw new Error('没有输出文字');
          if (/[<>]/.test(content)) throw new Error('只输出一段纯文本，不使用 HTML 标签');
          const words = countReadableWords(content);
          if (words > maximum) return { feedback: `本次补写 ${words} 字，超过上限 ${maximum} 字。请删减到 ${minimum}～${maximum} 字，只输出一段纯文本。`, reason: `补写 ${words} 字，超过上限 ${maximum} 字` };
          if (words < minimum) return { value: content, distance: maximum - words, feedback: `本次补写 ${words} 字，少于 ${minimum} 字。请补充到 ${minimum}～${maximum} 字，只输出一段纯文本。`, reason: `补写 ${words} 字，少于 ${minimum} 字` };
          return { accept: true, value: content };
        },
      });
      guard.signal.throwIfAborted();
      // Reread the section before writing because another location may already have inserted text; relocate and insert before the image block separator, preserving other content.
      const file = path.join(workspaceDir, item.section.file);
      const html = fs.readFileSync(file, 'utf8');
      const target = locateGap(html, item.gap);
      if (!target) throw new Error('图片块在补写期间已变化，未写回');
      if (!target.inserted) writeHtml(file, spliceHtml(html, [{ start: target.insertAt, end: target.insertAt, text: `<!-- savia:block -->\n<p id="${target.leadId}">${escapeHtml(text)}</p>\n\n` }]));
      settle(item, 'success');
    },
    onError(item, error, { cancelled }) {
      if (cancelled) {
        report([{ id: item.job.section_id, status: 'cancelled' }]);
        return;
      }
      save({ ...current, failures: { ...current.failures, [item.key]: { reason: `${error?.message || error}`, retry: error?.isAiRequestError === true } } });
      settle(item, 'error');
    },
  });
  // Recheck files at round end: sections with all insertions are complete; record remaining locations and reasons in failed_gaps.
  const completed = [];
  const failedGaps = [];
  for (const job of current.jobs) {
    const section = targets.get(job.section_id);
    const html = read(section);
    const missing = job.gaps.filter(gap => !locateGap(html, gap)?.inserted);
    if (!missing.length) completed.push(job.section_id);
    for (const gap of missing) {
      failedGaps.push({ section_id: job.section_id, number: section.number, title: section.title, figure_id: gap.figure_ids?.[0] || '',
        reason: current.failures[gapKey(job.section_id, gap)]?.reason || '补写未完成' });
    }
  }
  save({ ...current, completed_section_ids: completed, failed_gaps: failedGaps, submission: {} });
  report([], { label: `格式补写：完成 ${completed.length} 节${failedGaps.length ? `，${failedGaps.length} 处未补写` : ''}`, done: true });
  return current;
}

// Tool results: supplemented section count and reasons for unfilled locations.
function layoutSupplementResult(state) {
  return { sections: state.jobs.length, completed: state.completed_section_ids.length,
    failed: state.failed_gaps.map(({ number, title, figure_id, reason }) => ({ number, title, figure_id, reason })) };
}

// The only tool in the supplementation stage; submit results on completion for the main workflow to re-export and recheck.
function createContentGenerationLayoutTools({ aiService, signal, onActivity, layout, failTask = () => {} }, { Type, workspaceDir }) {
  return [{
    name: LAYOUT_TOOL, label: '补写排版留白', executionMode: 'sequential',
    description: 'Call only during layout supplementation. The program locates image blocks at detected gaps, generates paragraphs, checks their length and inserts them before the images. It returns completion and reasons for any unfinished positions. Call only this tool in this stage and set task_complete=true on this call.',
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_callId, _params, toolSignal) {
      const state = layout.get();
      if (state?.status !== 'supplementing') throw new Error('当前不在格式补写阶段');
      if (!state.submission) {
        try {
          await supplementLayoutGaps({ aiService, workspaceDir, signal: AbortSignal.any([signal, toolSignal].filter(Boolean)), onActivity, state: layout });
        } catch (error) {
          // End the whole task on consecutive upstream failures instead of repeated agent retries; resume supplementation at remaining locations.
          if (error?.code === AI_UPSTREAM_UNAVAILABLE) failTask(error);
          throw error;
        }
      }
      const details = layoutSupplementResult(layout.get());
      return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
    },
  }];
}

module.exports = { LAYOUT_TOOL, LAYOUT_TOOLS, buildLayoutPrompt, createContentGenerationLayoutTools, supplementLayoutGaps, locateGap };
