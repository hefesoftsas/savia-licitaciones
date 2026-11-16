const brand = require('../../brand.json');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('cheerio');
const { countReadableWords } = require('../utils/wordCount.cjs');
const { extractAiSource } = require('../utils/aiSourceExtraction.cjs');
const { AI_UPSTREAM_UNAVAILABLE } = require('../utils/aiBatchGuard.cjs');
const { createContentImageProtection, imageStructure } = require('./contentGenerationEditTools.cjs');
const { warmPromptPrefix, sharedPrefixMessages } = require('../utils/promptPrefixCache.cjs');
const { writeListFile } = require('./contentGenerationTaskFiles.cjs');
const { runAiBatch, requestWithFollowUp, writeHtml } = require('./contentGenerationAiBatch.cjs');

// Move the target inward from the nearest boundary by this fraction to offset systematically short or long rewrites.
const WORD_ADJUST_MARGIN = 0.02;
// Maximum section adjustment as a fraction of editable text, preventing excessive deletion or padding just to meet totals.
const WORD_ADJUST_SECTION_LIMIT = { shrink: 0.4, expand: 0.6 };
// Adjustments below this word count do not justify rewriting the whole section.
const WORD_ADJUST_MIN_WORDS = 100;
const WORD_ADJUST_MAX_ROUNDS = 2;
// Allowed section-target deviation is the greater of an adjustment fraction and a minimum word count; follow up once when exceeded.
const WORD_ADJUST_TOLERANCE = 0.25;
const WORD_ADJUST_MIN_TOLERANCE = 80;
const KEEP_PATTERN = new RegExp("<!--\\s*(?:savia|__BRAND_SLUG__):keep-(\\d+)\\s*-->".replaceAll('__BRAND_SLUG__', brand.slug), "g");
const WORD_ADJUST_TOOL = 'adjust-word-count';
// During word adjustment, the primary agent calls only the adjustment tool.
const WORD_ADJUST_TOOLS = [WORD_ADJUST_TOOL, 'report-failure'];

// Count readable body text in actual HTML, excluding image prompts.
function countHtmlWords(html) {
  return countReadableWords(String(html).replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ''));
}

const readDecisions = workspaceDir => JSON.parse(fs.readFileSync(path.join(workspaceDir, '正文编排决策.json'), 'utf8'));

// Count actual section results each round; submission checks may supply already-read sections to avoid rescanning content.
function checkWordCount(workspaceDir, { sections: inspectedSections } = {}) {
  const decisions = readDecisions(workspaceDir);
  const inspected = inspectedSections === undefined ? null : new Map(inspectedSections.map(section => [section.section_id, section]));
  const sections = [];
  const missing = [];
  for (const section of decisions.targets) {
    try {
      const words = inspected ? inspected.get(section.id)?.words || 0
        : countHtmlWords(fs.readFileSync(path.join(workspaceDir, section.file), 'utf8'));
      if (words <= 0) missing.push(section.id);
      else sections.push({ section_id: section.id, number: section.number, file: section.file, words });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing.push(section.id);
    }
  }
  const total = sections.reduce((sum, section) => sum + section.words, 0);
  const { minimumWords, maximumWords, checkTotalWords } = decisions.word_control;
  const difference = !checkTotalWords ? 0 : minimumWords > 0 && total < minimumWords
    ? minimumWords - total : maximumWords > 0 && total > maximumWords ? total - maximumWords : 0;
  const direction = !difference ? 'none' : minimumWords > 0 && total < minimumWords ? 'expand' : 'shrink';
  return {
    complete: missing.length === 0, missing_section_ids: missing, sections,
    total_words: total, minimum_words: minimumWords, maximum_words: maximumWords,
    check_total_words: checkTotalWords, difference, direction,
    in_range: missing.length === 0 && difference === 0,
  };
}

// Write section counts to the program manifest; send the model only totals and missing counts.
function reportWordCount(workspaceDir, words) {
  const { sections, missing_section_ids: missing, ...totals } = words;
  const file = writeListFile(workspaceDir, 'words', { total_words: words.total_words, sections, missing_section_ids: missing });
  return { ...totals, section_count: sections.length, missing_count: missing.length, detail_file: file };
}

// Do not send image blocks or tables to the model: replace their entire top-level elements with placeholder comments and restore them exactly after rewriting.
function protectBlocks(html) {
  const $ = load(String(html).replace(/\r\n/g, '\n'), null, false);
  const blocks = [];
  $.root().children().each((_index, node) => {
    const element = $(node);
    if (!element.is('figure, img, table') && !element.find('figure, img, table').length) return;
    blocks.push($.html(node));
    element.replaceWith(`<!-- savia:keep-${blocks.length} -->`);
  });
  return { text: $.html(), blocks };
}

// Each placeholder must occur exactly once in original order; otherwise return feedback the model can use to correct it.
function restoreBlocks(text, blocks) {
  const found = [...text.matchAll(KEEP_PATTERN)].map(match => Number(match[1]));
  if (found.length !== blocks.length || found.some((value, index) => value !== index + 1)) {
    const names = values => values.map(value => `keep-${value}`).join('、') || '无';
    throw new Error(`占位注释须按原顺序各保留一次：应为 ${names(blocks.map((_block, index) => index + 1))}，实际为 ${names(found)}`);
  }
  return text.replace(KEEP_PATTERN, (_match, index) => blocks[Number(index) - 1]);
}

// Allocate rewrites by deviation: first bring the most off-target sections toward their targets, then use sections with more editable text if needed, minimizing changed sections.
// Return null when no adjustment is needed; an empty jobs list means no sections can be adjusted.
function planWordAdjustment(workspaceDir) {
  const words = checkWordCount(workspaceDir);
  if (!words.check_total_words || !words.complete || words.in_range) return null;
  const { direction, total_words: total, minimum_words: minimum, maximum_words: maximum } = words;
  const bound = direction === 'shrink' ? maximum : minimum;
  let margin = Math.round(bound * WORD_ADJUST_MARGIN);
  if (minimum > 0 && maximum > 0) margin = Math.min(margin, Math.floor((maximum - minimum) / 2));
  const goal = direction === 'shrink' ? bound - margin : bound + margin;
  const sign = direction === 'shrink' ? 1 : -1;
  const targetWords = new Map(readDecisions(workspaceDir).targets.map(section => [section.id, section.content_plan?.target_words || 0]));
  const sections = words.sections.map(section => {
    const adjustable = countHtmlWords(protectBlocks(fs.readFileSync(path.join(workspaceDir, section.file), 'utf8')).text);
    const target = targetWords.get(section.section_id);
    return { ...section, amount: 0, limit: Math.floor(adjustable * WORD_ADJUST_SECTION_LIMIT[direction]),
      deviation: target > 0 ? (section.words - target) * sign : 0 };
  });
  let remaining = Math.abs(total - goal);
  // For small remaining amounts, allocate the minimum adjustment and absorb slight overshoot in the target margin.
  const allocate = (section, available) => {
    const amount = Math.min(available, Math.max(remaining, WORD_ADJUST_MIN_WORDS));
    if (amount < WORD_ADJUST_MIN_WORDS) return;
    section.amount += amount;
    remaining -= amount;
  };
  for (const section of sections.filter(item => item.deviation > 0).sort((left, right) => right.deviation - left.deviation)) {
    if (remaining <= 0) break;
    allocate(section, Math.min(section.deviation, section.limit));
  }
  for (const section of [...sections].sort((left, right) => right.limit - left.limit)) {
    if (remaining <= 0) break;
    allocate(section, section.limit - section.amount);
  }
  return {
    direction, goal, total_words: total, minimum_words: minimum, maximum_words: maximum,
    need: Math.abs(total - goal), shortfall: Math.max(0, remaining),
    jobs: sections.filter(section => section.amount > 0)
      .map(section => ({ section_id: section.section_id, from_words: section.words, target_words: section.words - sign * section.amount })),
  };
}

// Persistent word-adjustment state: results covers only the current round; rewritten_section_ids and failures aggregate across rounds for results and task logs.
function createWordAdjustState(plan) {
  return { status: 'running', round: 1, direction: plan.direction, goal: plan.goal,
    minimum_words: plan.minimum_words, maximum_words: plan.maximum_words, initial_words: plan.total_words,
    round_start_words: plan.total_words, planned_count: plan.jobs.length, jobs: plan.jobs, results: {},
    rewritten_section_ids: [], failures: {}, history: [] };
}

const wordRange = state => `${state.minimum_words || '不限'}～${state.maximum_words || '不限'}`;

// Stage prompts only instruct the tool call; the tool handles allocation, rewriting, and rechecking.
function buildWordAdjustPrompt(state) {
  if (state.status === 'completed') return `Word-count adjustment is complete. Call ${WORD_ADJUST_TOOL} to read the result and set task_complete=true on that call. Do not read or modify the body or call other tools.`;
  return `Adjust the word count. The body contains ${state.initial_words} words; the required range is ${state.minimum_words || 'unlimited'}–${state.maximum_words || 'unlimited'}. The program allocated adjustments to ${state.jobs.length} sections based on their deviations. Call ${WORD_ADJUST_TOOL} and set task_complete=true on that call. The tool performs allocation, rewriting, validation and review. Do not read or modify the body or call other tools. This stage ends after the tool returns; the program then starts the consistency audit. If the tool fails, retry according to its error.`;
}

// All sections in a round adjust in the same direction; put rewrite rules in system for concurrent prefix-cache reuse.
function buildAdjustSystem(direction) {
  const rules = direction === 'shrink'
    ? 'Shortening: first remove repetition, redundant modifiers, empty transitions and explanations that can be combined; similar paragraphs may be merged. Preserve substantive information, factual parameters, quantities, deadlines, responsibilities and commitments. Never meet the target by deleting necessary information.'
    : 'Expansion: around the section title and writing focus, add concrete implementation measures, conditions, responsibilities, checks or deliverables, within existing paragraphs or new ones. New content must not conflict with global facts. Apply the project missing-fact rule where global facts are silent; do not invent numbers, people, certificates or experience. Do not repeat content to meet the target.';
  return `Adjust the length of one bid-body section by ${direction === 'shrink' ? 'shortening' : 'expanding'} it toward its section target. Return the complete adjusted HTML for the section.
Word counting: each Chinese character counts as one word; each continuous sequence of English letters or digits counts as one. Exclude punctuation, whitespace, HTML tags and comments. Aim close to the target.
${rules}
Preserve substantive information, factual parameters, commitments and existing conclusions. Resolve factual conflicts in favor of global facts.
Return a restricted HTML fragment beginning with <!-- savia:block -->, with this marker on its own line before every top-level block. Top-level elements are only p, ol and ul. Keep IDs on existing blocks; number new IDs with the same section prefix and do not duplicate existing IDs. Close all non-void elements. Do not use h1–h6, Markdown, code fences or explanations. Do not use LaTeX; express formulas, parameters and units in plain text, Unicode mathematical symbols and <sup>/<sub>, for example 22 ℃ ± 2 ℃ or ≥30 m<sup>3</sup>/(h·person).
Comments such as <!-- savia:keep-1 --> represent existing images or tables and must not be modified. Preserve each placeholder exactly once, in its original order, with <!-- savia:block --> before it. Never delete, copy or rewrite placeholders. Text paragraphs before or after placeholders may be added, removed or rewritten.
Return only the complete adjusted HTML.`;
}

// Call models directly per section and save rewrites; follow up once in the same conversation for excessive target deviation or unusable output.
// state provides get/save and persists progress per completed section; resumes fill unsuccessful sections except unusable-output failures, while retrying upstream request failures.
async function adjustContentWordCount({ aiService, workspaceDir, signal, onActivity, state, validateHtml }) {
  let current = state.get();
  const save = next => {
    current = next;
    state.save(current);
  };
  const itemId = sectionId => `r${current.round}:${sectionId}`;
  // Current total = round-start total + word changes in rewritten sections; update progress labels after each section.
  const currentWords = () => current.round_start_words + current.jobs.reduce((sum, job) => {
    const result = current.results[job.section_id];
    return result?.status === 'success' ? sum + result.words - job.from_words : sum;
  }, 0);
  const report = (items, extra = {}) => onActivity?.({ progress: { step: 'word-adjust',
    label: `字数校正第 ${current.round} 轮：当前 ${currentWords()} 字，目标约 ${current.goal} 字（要求 ${wordRange(current)} 字）`,
    unit: '节', total: current.planned_count, items, ...extra } });
  const read = file => fs.readFileSync(path.join(workspaceDir, file), 'utf8');
  while (current.status === 'running') {
    const decisions = readDecisions(workspaceDir);
    const targets = new Map(decisions.targets.map(section => [section.id, section]));
    const sign = current.direction === 'shrink' ? 1 : -1;
    const succeed = (job, words) => {
      const { [job.section_id]: _removed, ...failures } = current.failures;
      save({ ...current, results: { ...current.results, [job.section_id]: { status: 'success', words } },
        rewritten_section_ids: [...new Set([...current.rewritten_section_ids, job.section_id])], failures });
    };
    // A section interrupted after writing but before recording already has a changed count; treat it as complete to avoid rewriting twice.
    for (const job of current.jobs) {
      if (current.results[job.section_id]?.status === 'success') continue;
      const words = countHtmlWords(read(targets.get(job.section_id).file));
      if (words !== job.from_words) succeed(job, words);
    }
    const pending = current.jobs.filter(job => {
      const result = current.results[job.section_id];
      return result?.status !== 'success' && !(result?.status === 'error' && !result.retry);
    });
    report(current.jobs.map(job => ({ id: itemId(job.section_id), status: current.results[job.section_id]?.status === 'success' ? 'success' : 'pending' })));
    if (pending.length) {
      const system = buildAdjustSystem(current.direction);
      const sharedInput = `项目概述：\n${read('项目概述.md')}\n\n全局事实设定（完整内容）：\n${read('全局事实设定.md')}\n\n本项目事实缺失处理要求：\n${decisions.global_facts_requirements}\n\n用户额外要求：\n${decisions.user_requirement || '无'}`;
      if (pending.length > 1) await warmPromptPrefix({ aiService, messages: sharedPrefixMessages(system, sharedInput), signal, onActivity, logTitle: '字数校正-公共前缀预热', label: '字数校正公共材料' });
      await runAiBatch({
        items: pending, signal,
        async run(job, guard) {
          report([{ id: itemId(job.section_id), status: 'running' }]);
          const section = targets.get(job.section_id);
          const file = path.join(workspaceDir, section.file);
          const original = fs.readFileSync(file, 'utf8');
          const { text, blocks } = protectBlocks(original);
          // The model sees only editable text; calculate its target excluding image blocks and tables.
          const fixed = countHtmlWords(original) - countHtmlWords(text);
          const target = job.target_words - fixed;
          const amount = Math.abs(job.target_words - job.from_words);
          const tolerance = Math.max(WORD_ADJUST_MIN_TOLERANCE, Math.round(amount * WORD_ADJUST_TOLERANCE));
          const structure = imageStructure(original);
          const best = await requestWithFollowUp({
            aiService, guard, logTitle: `字数校正-${section.number}-${section.title}`,
            messages: sharedPrefixMessages(system, sharedInput, `本节：${section.number} ${section.title}（${section.chapter_path || section.title}）\n本节写作重点：${section.content_plan?.writing_focus || '未提供'}\n本节文字当前 ${countHtmlWords(text)} 字（不含占位注释代表的图片和表格），目标约 ${target} 字，需要${current.direction === 'shrink' ? '删减' : '补充'}约 ${amount} 字。\n\n本节当前 HTML：\n${text}`),
            evaluate(reply) {
              const html = restoreBlocks(extractAiSource(reply, 'html').trim(), blocks);
              validateHtml(html);
              if (imageStructure(html) !== structure) throw new Error('图片或表格与原文不一致，请原样保留全部占位注释');
              const words = countHtmlWords(html);
              const distance = Math.abs(words - job.target_words);
              const reason = `改写结果 ${words} 字，目标 ${job.target_words} 字`;
              const feedback = `本次结果的文字为 ${words - fixed} 字，目标约 ${target} 字。请在这一结果基础上再${words > job.target_words ? '删减' : '补充'}约 ${distance} 字，其他要求不变，重新输出完整 HTML。`;
              if ((job.from_words - words) * sign <= 0) return { feedback, reason };
              if (distance <= tolerance) return { accept: true, value: { html, words } };
              return { value: { html, words }, distance, feedback, reason };
            },
          });
          guard.signal.throwIfAborted();
          writeHtml(file, best.html);
          succeed(job, best.words);
          report([{ id: itemId(job.section_id), status: 'success' }]);
        },
        onError(job, error, { cancelled }) {
          report([{ id: itemId(job.section_id), status: cancelled ? 'cancelled' : 'error' }]);
          if (cancelled) return;
          const section = targets.get(job.section_id);
          const reason = `${error?.message || error}${error?.isAiRequestError ? '' : '，已保留原文'}`;
          save({ ...current, results: { ...current.results, [job.section_id]: { status: 'error', error: reason, retry: error?.isAiRequestError === true } },
            failures: { ...current.failures, [job.section_id]: { number: section.number, title: section.title, reason } } });
        },
      });
    }
    // Recheck totals at round end; allocate another round from current counts only when still outside range, progressing toward target, and below the round limit.
    const words = checkWordCount(workspaceDir);
    const results = Object.values(current.results);
    const history = [...current.history, { round: current.round, before_words: current.round_start_words, after_words: words.total_words,
      success: results.filter(item => item.status === 'success').length, failed: results.filter(item => item.status === 'error').length }];
    const progressed = (current.round_start_words - words.total_words) * sign > 0;
    const next = !words.in_range && progressed && current.round < WORD_ADJUST_MAX_ROUNDS ? planWordAdjustment(workspaceDir) : null;
    if (next?.jobs.length) {
      save({ ...current, round: current.round + 1, direction: next.direction, goal: next.goal, round_start_words: words.total_words,
        planned_count: current.planned_count + next.jobs.length, jobs: next.jobs, results: {}, history });
    } else {
      save({ ...current, status: 'completed', final_words: words.total_words, in_range: words.in_range, history });
    }
  }
  reportWordCount(workspaceDir, checkWordCount(workspaceDir));
  report([], { label: `字数校正完成：${current.initial_words} → ${current.final_words} 字（要求 ${wordRange(current)} 字），改写 ${current.rewritten_section_ids.length} 节${current.in_range ? '' : '，仍未达标'}`, done: true });
  return current;
}

// Tool results: total word change, rewritten section count, and section failure reasons.
function wordAdjustResult(state) {
  return { initial_words: state.initial_words, final_words: state.final_words, minimum_words: state.minimum_words, maximum_words: state.maximum_words,
    in_range: state.in_range, rewritten: state.rewritten_section_ids.length, failed: Object.values(state.failures) };
}

// The primary agent only counts words; the program applies requirements after content submission. Describe behavior without exposing the user's toggle.
const WORD_COUNT_ONLY_NOTE = '本工具只统计实际字数：保持正文不变，不以任何方式（包括脚本批量删改）调整字数；字数要求由程序在本阶段提交后按设置统一处理。';

// Count words and enable image protection; adjust-word-count performs programmatic rewrites in the adjustment stage.
function createContentGenerationWordTools({ aiService, signal, activity, inspectSection, onActivity, imageProtection, wordAdjust, validateHtml, failTask = () => {} }, { Type, workspaceDir, setActiveTools }) {
  let protection = imageProtection;
  // Enable protection only when content and illustrations are complete, avoiding locking unfinished images in the protected stage.
  function enterProtection() {
    const decisions = readDecisions(workspaceDir);
    const inspections = decisions.targets.map(section => inspectSection(section, { checkStructure: true }));
    const words = checkWordCount(workspaceDir, { sections: inspections.map(item => item.section).filter(Boolean) });
    if (words.complete) {
      // Create image baselines only for content with valid structure and references; reuse word counts from the same check.
      for (let index = 0; index < inspections.length; index += 1) {
        const issues = inspections[index].issues;
        if (issues.length) throw new Error(`${decisions.targets[index].file}：${issues.map(issue => issue.message).join('；')}`);
      }
      protection ||= createContentImageProtection({ workspaceDir, files: decisions.targets.map(section => section.file), setActiveTools });
      protection.enter();
    }
    return words;
  }
  const result = (details, text = details) => ({ content: [{ type: 'text', text: JSON.stringify(text) }], details });
  return [{
    name: 'check-word-count', label: '检查正文总字数', executionMode: 'sequential',
    description: `仅在全部正文和配图完成后调用。读取实际 HTML，返回总字数、上下限和缺失小节数，各节字数及缺失小节 ID 写入 程序清单/正文字数统计.json，按需读取；内容就绪后启用图片写入保护，不修改正文。${WORD_COUNT_ONLY_NOTE}`,
    parameters: Type.Object({}),
    async execute() {
      if (activity.pending) throw new Error('仍有生成或编辑任务运行，请等待全部结束再检查字数');
      onActivity?.({ progress: { step: 'word-check', label: '正在统计正文总字数' } });
      const words = enterProtection();
      onActivity?.({ progress: { step: 'word-check', label: `实际 ${words.total_words} 字${words.check_total_words ? `，${words.in_range ? '已达标' : `距有效范围相差 ${words.difference} 字`}` : '，本轮仅统计字数'}`, done: true } });
      // Differences and directions are for programmatic adjustment and progress only, never model input, so the primary agent does not independently alter counts.
      const { difference: _difference, direction: _direction, in_range: _inRange, ...facts } = reportWordCount(workspaceDir, words);
      return result(words, { ...facts, note: WORD_COUNT_ONLY_NOTE });
    },
  }, {
    name: WORD_ADJUST_TOOL, label: '字数校正', executionMode: 'sequential',
    description: '仅在字数校正阶段调用：程序按已分配的调整量逐节改写、校验并复查总字数，返回校正前后字数、改写节数和失败小节。本阶段只调用本工具，并在本次调用上设置 task_complete=true。',
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_callId, _params, toolSignal) {
      const state = wordAdjust.get();
      if (!state) throw new Error('当前不在字数校正阶段');
      if (state.status !== 'completed') {
        try {
          await adjustContentWordCount({ aiService, workspaceDir, signal: AbortSignal.any([signal, toolSignal].filter(Boolean)), onActivity, state: wordAdjust, validateHtml });
        } catch (error) {
          // End the whole task on consecutive upstream failures instead of repeated agent retries; resume rewriting from saved progress.
          if (error?.code === AI_UPSTREAM_UNAVAILABLE) failTask(error);
          throw error;
        }
      }
      return result(wordAdjustResult(wordAdjust.get()));
    },
  }];
}

module.exports = {
  WORD_ADJUST_TOOL, WORD_ADJUST_TOOLS, countHtmlWords, checkWordCount, reportWordCount, protectBlocks, restoreBlocks,
  planWordAdjustment, createWordAdjustState, buildWordAdjustPrompt, buildAdjustSystem, adjustContentWordCount, createContentGenerationWordTools,
};
