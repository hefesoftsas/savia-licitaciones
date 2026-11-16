const fs = require('node:fs');
const { NATIVE_AGENT_TOOLS } = require('./agent/agentToolEnvironment.cjs');
const path = require('node:path');
const crypto = require('node:crypto');
const cheerio = require('cheerio');
const { SUBMISSION_FIX_TOOL, editContentSections, batchResponse } = require('./contentGenerationEditTools.cjs');
const { TASK_FILE_WRITING, taskFilePath, readTaskFile, writeListFile, readListFile } = require('./contentGenerationTaskFiles.cjs');
const { warmPromptPrefix, sharedPrefixMessages } = require('../utils/promptPrefixCache.cjs');
const { AI_QUEUE_SCOPE_PAUSED } = require('../utils/aiRequestQueue.cjs');
const { AI_UPSTREAM_UNAVAILABLE, createAiBatchGuard, isBatchCancelled } = require('../utils/aiBatchGuard.cjs');

// Dispatch many-section repairs concurrently through repair-sections; the primary agent can edit a few sections directly, with results checked on submission.
const CONSISTENCY_TOOLS = [...NATIVE_AGENT_TOOLS, 'ask-user', 'search-sections', 'recheck-sections', 'repair-sections', 'complete-consistency-round', SUBMISSION_FIX_TOOL, 'report-failure'];
const LEDGER_JSON = '正文一致性事实台账.json';
const LEDGER_FILE = '正文一致性事实台账.md';
// Increment when checking criteria or ledger structure changes to invalidate all older caches.
const LEDGER_VERSION = 2;
const ISSUE_TYPES = ['与全局事实冲突', '小节内部矛盾'];
const FACT_CATEGORIES = ['人数与数量', '日期与期限', '频次与时限', '地点与范围', '金额', '技术参数', '编号与名称', '责任归属', '其他'];
const SEARCH_LIMIT = 80;
const SNIPPET_LENGTH = 400;
const REPAIR_INSTRUCTIONS = '只修复主 Agent 指定的矛盾及本批统一修复规则涉及的内容，遵循其统一结论，只改与矛盾直接相关的数值或陈述，其他用词、称谓和表述保持原样，不检查或调整总字数。主 Agent 给出的段落 ID 只用于定位：问题文字不在该段时，在本节内按语义找到同一问题所在位置修改，不因段落 ID 不符而失败；指定问题在本节已不存在（例如已经修复）时不修改，简短说明后结束；本轮修改后提交真实结果，未完全消除的矛盾交由主 Agent 统一验收；只有无法继续执行的实际阻断才调用 report-failure。';
const RULE_CHECK_INSTRUCTIONS = '本节无单独指定问题：按本批统一修复规则在本节全文按语义自查，发现相关表述即按规则修改；没有相关内容时不修改，直接简短回复“本节无需修改”结束。';

// For mistyped IDs, suggest targets sharing at least the first eight characters or the entire segment so the primary agent can correct and redispatch.
function unknownSectionMessage(id, targets) {
  const commonPrefix = value => { let index = 0; while (index < id.length && index < value.length && id[index] === value[index]) index += 1; return index; };
  const candidates = [...targets.values()].filter(section => commonPrefix(section.id) >= Math.min(8, section.id.length))
    .map(section => `${section.number} ${section.title}（${section.id}）`);
  return `未执行：小节 ID 不属于本轮目标：${id}。${candidates.length ? `ID 开头相同的目标小节：${candidates.join('；')}。` : ''}请从台账“小节目录”原样复制小节 ID 后重新派发。`;
}

const readDecisions = workspaceDir => JSON.parse(fs.readFileSync(path.join(workspaceDir, '正文编排决策.json'), 'utf8'));

// Accumulate round repair results by section: keep the latest dispatch status and append change comparisons; clear the entire program manifest at a new round.
function mergeRepairResults(previous, batch) {
  const merged = new Map((previous?.results || []).map(item => [item.section_id, item]));
  for (const item of batch) {
    const old = merged.get(item.section_id);
    merged.set(item.section_id, old?.changes ? { ...item, changes: [...old.changes, ...(item.changes || [])] } : item);
  }
  const results = [...merged.values()];
  const repaired = results.filter(item => item.status === 'success').length;
  return { summary: { repaired, failed: results.length - repaired }, results };
}

// Audit scope: inspect and repair current targets; when adding sections, other completed sections are read-only references in current outline order.
function auditScope(workspaceDir) {
  const decisions = readDecisions(workspaceDir);
  const references = (decisions.completed_sections || [])
    .filter(section => fs.existsSync(path.join(workspaceDir, section.file)))
    .map(section => ({ ...section, reference: true }));
  const outlineFile = path.join(workspaceDir, '正文完整目录.json');
  const order = new Map();
  const visit = items => items.forEach(item => { order.set(item.id, order.size); if (item.children) visit(item.children); });
  if (fs.existsSync(outlineFile)) visit(JSON.parse(fs.readFileSync(outlineFile, 'utf8')).outline || []);
  const sections = [...decisions.targets, ...references]
    .sort((left, right) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity));
  return { decisions, targets: decisions.targets, references, sections };
}

// Audit content facts only: split by top-level elements, remove tags/comments/image prompts, and retain paragraph IDs, captions, and table data.
function auditBlocks(html) {
  const $ = cheerio.load(String(html).replace(/\r\n/g, '\n'), null, false);
  $('template').remove();
  // Preserve superscripts, subscripts, and line breaks as readable symbols: 10<sup>3</sup> becomes 10^3, not 103, and text across breaks stays separated.
  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const [tag, symbol] of [['sup', '^'], ['sub', '_']]) {
    $(tag).each((_index, item) => {
      const value = $(item).text().trim();
      $(item).replaceWith(!value ? '' : escape(/^-?[\p{L}\p{N}.]+$/u.test(value) ? `${symbol}${value}` : `${symbol}(${value})`));
    });
  }
  $('br').replaceWith(' ');
  const text = node => $(node).text().replace(/\s+/g, ' ').trim();
  const figure = node => `[图 ${$(node).attr('id') || ''}：${text($(node).find('figcaption')) || $(node).find('img').attr('alt') || '无图注'}]`;
  function cell(node) {
    const figures = $(node).find('figure').toArray().map(figure);
    const rest = $(node).clone();
    rest.find('figure').remove();
    return [...figures, text(rest)].filter(Boolean).join(' ');
  }
  return $.root().children().toArray().map((node, index) => {
    let body;
    if (node.name === 'figure') body = figure(node);
    else if (node.name === 'table') {
      const caption = text($(node).children('caption'));
      const rows = $(node).find('tr').toArray().map(row => $(row).children('th, td').toArray().map(cell).join(' | '));
      body = [caption && `表：${caption}`, ...rows].filter(Boolean).join('\n');
    } else if (node.name === 'ol' || node.name === 'ul') {
      body = $(node).children('li').toArray().map((item, itemIndex) => `${node.name === 'ol' ? `${itemIndex + 1}.` : '-'} ${text(item)}`).join('\n');
    } else body = text(node);
    const id = $(node).attr('id') || `第${index + 1}块`;
    // Collect referenceable IDs from the same representation as display: top-level blocks, including generated indices, and nested images, independent of attribute quoting.
    return { id, text: body, ids: [id, ...$(node).find('[id]').toArray().map(item => $(item).attr('id'))] };
  }).filter(block => block.text);
}

const formatAuditBlocks = blocks => blocks.map(block => `[${block.id}] ${block.text}`).join('\n');

function sectionAuditText(html) {
  return formatAuditBlocks(auditBlocks(html));
}

// Return only before/after text for changed paragraphs so the primary agent can verify without rereading the whole section.
function blockChanges(beforeHtml, afterHtml) {
  const before = new Map(auditBlocks(beforeHtml).map(block => [block.id, block.text]));
  const after = auditBlocks(afterHtml);
  const changes = after.filter(block => before.get(block.id) !== block.text)
    .map(block => ({ block_id: block.id, before: before.get(block.id) ?? '', after: block.text }));
  const afterIds = new Set(after.map(block => block.id));
  for (const [id, text] of before) if (!afterIds.has(id)) changes.push({ block_id: id, before: text, after: '' });
  return changes;
}

function readLedger(workspaceDir) {
  const file = path.join(workspaceDir, LEDGER_JSON);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { sections: {} };
}

function writeWorkspaceFile(workspaceDir, file, content) {
  const target = path.join(workspaceDir, file);
  fs.writeFileSync(`${target}.tmp`, content, 'utf8');
  fs.renameSync(`${target}.tmp`, target);
}

const hashHtml = html => crypto.createHash('sha256').update(html).digest('hex');

const writeLedgerJson = (workspaceDir, ledger) => writeWorkspaceFile(workspaceDir, LEDGER_JSON, JSON.stringify(ledger, null, 2));

// List target issues in outline order and facts by category and subject; reference sections contribute facts only for adjacent cross-section comparison.
// List failed checks and reasons separately for the primary agent to recheck or inspect manually.
function buildLedgerMarkdown(sections, ledger) {
  const incremental = sections.some(section => section.reference);
  const label = section => `${section.number} ${section.title}`;
  const tag = section => !incremental ? '' : section.reference ? '[参考·只读] ' : '[本轮目标] ';
  const checked = sections.filter(section => ledger.sections[section.id]);
  const failed = sections.filter(section => !ledger.sections[section.id]);
  const issues = checked.filter(section => !section.reference)
    .flatMap(section => ledger.sections[section.id].issues.map(issue => ({ section, issue })));
  const facts = checked.flatMap(section => ledger.sections[section.id].facts.map(fact => ({ section, fact })));
  const factLines = FACT_CATEGORIES.flatMap(category => {
    const group = facts.filter(({ fact }) => fact.category === category)
      .sort((left, right) => left.fact.subject.localeCompare(right.fact.subject, 'zh-Hans-CN'));
    return group.length ? [`### ${category}`, ...group.map(({ section, fact }) => `- ${fact.subject}：${fact.value} —— ${section.number}${section.reference ? '（参考）' : ''} [${fact.block_id || '未定位'}]${fact.quote ? `“${fact.quote}”` : ''}`), ''] : [];
  });
  return [
    '# 正文一致性事实台账',
    `程序并发核对${incremental ? '本轮新增小节，并汇总已完成小节的事实作为只读参考' : '本轮各目标小节'}，只读。方括号内为原小节 HTML 中元素的 id；核实原文时使用 search-sections 或定点读取原小节文件。`,
    '',
    '## 小节目录',
    ...sections.map(section => `- ${tag(section)}${label(section)}｜小节 ID：${section.id}｜文件：${section.file}`),
    '',
    ...(failed.length ? [
      `## 核对失败的小节（共 ${failed.length} 节，其问题和事实未列入本台账）`,
      '先调用 recheck-sections 重新核对（失败原因指向本节 HTML 时可先修正再核对）；仍失败时读取原小节文件自行核对问题和事实，提交结论时在 manually_checked_section_ids 中列出。',
      ...failed.map(section => `- ${tag(section)}${label(section)}｜小节 ID：${section.id}｜文件：${section.file}｜原因：${ledger.failures?.[section.id] || '尚未核对'}`),
      '',
    ] : []),
    `## 一、${incremental ? '本轮目标' : ''}小节核对发现的问题（共 ${issues.length} 项）`,
    ...(issues.length ? issues.map(({ section, issue }, index) => `${index + 1}. [${label(section)}｜${section.id}｜${issue.block_id || '未定位'}] ${issue.type}：${issue.problem}；依据：${issue.evidence}；建议：${issue.suggestion}`) : ['无']),
    '',
    `## 二、可核对事实（共 ${facts.length} 条，按类别及主体排列${incremental ? '；标注“参考”的来自已完成小节，只读' : ''}）`,
    ...(facts.length ? factLines : ['无']),
  ].join('\n');
}

// Put shared round-wide checking rules in system; provide only shared global facts and section content to reuse prefix caches across concurrent requests.
function buildExtractionSystem() {
  return `你负责投标正文一致性审计中的单小节核对，只处理本次请求提供的一个小节，不改写正文。一致性审计只关注两类问题：正文前后矛盾，以及正文与全局事实设定冲突。任务包括两部分。
一、核对问题（issues），只报告两类：
1. 与全局事实冲突：本节说法与全局事实设定中明确写出的内容相反，或数量、日期、期限、地点、金额、编号、名称、参数等取值不一致。
2. 小节内部矛盾：本节对同一对象、同一条件和时间范围的两处说法不能同时成立，例如数量、日期、期限、频次、时限、地点、金额、技术参数不一致，或同一事项的责任方互相排斥。
判断前核对对象、适用条件和时间范围，因对象、条件或阶段不同产生的差异不属于问题。以下情况不是问题，不报告：用词、称谓、表述不同或详略不同；全局事实未提及的补充内容（例如岗位、流程、交付物、频次、承诺），只要不与全局事实或本节其他内容冲突；承诺语气强弱；文风、润色和篇幅。不追究内容是否有材料依据。只报告会影响阅读理解或项目实施的明显问题；没有问题时 issues 为空数组。
二、可核对事实（facts）：抽取本节中有具体取值或明确归属、其他小节可能写出不同说法的陈述，用于跨小节比对，例如人数与数量、日期与期限、频次与时限、地点与范围、金额、技术参数、编号与名称，以及某项工作明确由哪一方负责。value 使用简短写法；同一事实只记一次；不抽取流程说明、一般性职责描述或没有具体取值、具体归属的表述。
输出一个 JSON 对象：{"issues":[{"block_id":"段落编号","type":"问题类型","problem":"矛盾说明","evidence":"依据，引用全局事实或本节原文","suggestion":"建议的统一结论"}],"facts":[{"category":"类别","subject":"事实主体，如“服务期”","value":"本节中的取值或归属，如“一年”","block_id":"段落编号","quote":"本节原文摘录，不超过40字"}]}
type 只能取：${ISSUE_TYPES.join('、')}。category 只能取：${FACT_CATEGORIES.join('、')}。block_id 原样填写正文方括号内的段落编号（如 B3），无法对应具体段落时填空字符串。只输出 JSON，不输出其他内容。`;
}

const reportExtraction = (onActivity, total, items, extra = {}) => onActivity?.({ progress: { step: 'consistency-extract', label: '正在并发核对小节事实', unit: '节', total, items, ...extra } });

// Check selected sections concurrently and save each to the ledger: successes under sections, failure reasons under failures for the primary agent.
// Throw pause errors on pause; stop remaining sections and throw on consecutive upstream failures, preserving completed checks.
async function checkLedgerSections({ aiService, workspaceDir, ledger, pending, total, signal, onActivity, onChecked = () => {} }) {
  const read = file => fs.readFileSync(path.join(workspaceDir, file), 'utf8');
  const report = (items, extra) => reportExtraction(onActivity, total, items, extra);
  const guard = createAiBatchGuard({ signal });
  const system = buildExtractionSystem();
  const sharedInput = `全局事实设定（完整内容）：\n${read('全局事实设定.md')}`;
  ledger.failures ||= {};
  if (pending.length > 1) await warmPromptPrefix({ aiService, messages: sharedPrefixMessages(system, sharedInput), signal: guard.signal, onActivity, logTitle: '一致性核对-公共前缀预热', label: '一致性核对公共材料' });
  const results = await Promise.allSettled(pending.map(async section => {
    try {
      guard.signal.throwIfAborted();
      report([{ id: section.id, status: 'running' }]);
      const html = read(section.file);
      const blocks = auditBlocks(html);
      const ids = new Set(blocks.flatMap(block => block.ids));
      // Use program-assigned paragraph numbers so the model cannot rewrite irregular source IDs; map responses back to real IDs and clear unmatched ones.
      const labels = new Map(blocks.map((block, index) => [`B${index + 1}`, block.id]));
      const blockId = value => {
        const raw = String(value ?? '').trim().replace(/^\[|\]$/g, '').trim();
        return labels.get(raw) || (ids.has(raw) ? raw : '');
      };
      const result = await aiService.requestJson({
        signal: guard.signal, logTitle: `一致性核对-${section.number}-${section.title}`, progressLabel: `一致性核对 ${section.number}`,
        failureMessage: `小节 ${section.number} ${section.title} 的一致性核对结果无效`,
        messages: sharedPrefixMessages(system, sharedInput, `本节：${section.number} ${section.title}（小节 ID：${section.id}）\n${section.reference ? '本节为已完成的参考小节：issues 返回空数组，只抽取 facts。\n' : ''}本节正文（方括号内为段落编号）：\n${blocks.map((block, index) => `[B${index + 1}] ${block.text}`).join('\n')}`),
        normalizer: output => ({
          issues: section.reference ? [] : (output?.issues || []).map(issue => ({ ...issue, block_id: blockId(issue?.block_id) })),
          facts: (output?.facts || []).map(fact => ({ ...fact, block_id: blockId(fact?.block_id) })),
        }),
        validator(output) {
          const text = value => typeof value === 'string' && value.trim();
          for (const issue of output.issues) {
            if (!ISSUE_TYPES.includes(issue.type) || !text(issue.problem) || typeof issue.evidence !== 'string' || typeof issue.suggestion !== 'string') throw new Error('issues 每项须包含合法 type 及 problem、evidence、suggestion');
          }
          for (const fact of output.facts) {
            if (!FACT_CATEGORIES.includes(fact.category) || !text(fact.subject) || !text(fact.value) || typeof fact.quote !== 'string') throw new Error('facts 每项须包含合法 category 及 subject、value、quote');
          }
        },
      });
      guard.signal.throwIfAborted();
      guard.success();
      ledger.sections[section.id] = { version: LEDGER_VERSION, hash: hashHtml(html), ...(section.reference ? { reference: true } : {}), ...result };
      delete ledger.failures[section.id];
      writeLedgerJson(workspaceDir, ledger);
      report([{ id: section.id, status: 'success' }]);
      onChecked();
    } catch (error) {
      const cancelled = isBatchCancelled(error, guard.signal);
      if (!cancelled) {
        guard.failure(error);
        ledger.failures[section.id] = error?.message || String(error);
        writeLedgerJson(workspaceDir, ledger);
      }
      report([{ id: section.id, status: cancelled ? 'cancelled' : 'error' }]);
      throw error;
    }
  }));
  signal.throwIfAborted();
  if (guard.error) throw guard.error;
  const paused = results.find(item => item.status === 'rejected' && item.reason?.code === AI_QUEUE_SCOPE_PAUSED);
  if (paused) throw paused.reason;
}

// Check and save sections concurrently; after pause, fill only unfinished sections. Programmatic steps bypass the primary-session model.
// Individual check failures do not stop auditing; record them for the primary agent. Consecutive upstream failures stop the task, and resumes fill only remaining sections.
// With checkChanges=true, use content hashes to recheck changed sections and reuse previous results for unchanged references.
async function extractConsistencyLedger({ aiService, workspaceDir, signal, onActivity, checkChanges = true, onProgress = () => {} }) {
  const { sections } = auditScope(workspaceDir);
  const read = file => fs.readFileSync(path.join(workspaceDir, file), 'utf8');
  const stored = readLedger(workspaceDir);
  const ledger = { version: LEDGER_VERSION, sections: {}, failures: {} };
  for (const section of sections) {
    const entry = stored.sections?.[section.id];
    // Reference sections yield facts only; do not reuse those results when the same section becomes a current target.
    if (entry?.version === LEDGER_VERSION && (section.reference || !entry.reference)
      && (!checkChanges || entry.hash === hashHtml(read(section.file)))) ledger.sections[section.id] = entry;
  }
  const done = () => sections.filter(section => ledger.sections[section.id]).length;
  const pending = sections.filter(section => !ledger.sections[section.id]);
  // When resuming comparison/repair without missing sections, reuse the ledger without rewriting it or returning the UI to checking.
  if (!checkChanges && !pending.length) return ledger;
  writeLedgerJson(workspaceDir, ledger);
  reportExtraction(onActivity, sections.length, sections.map(section => ({ id: section.id, status: ledger.sections[section.id] ? 'success' : 'pending' })));
  onProgress(done(), sections.length);
  if (pending.length) {
    await checkLedgerSections({ aiService, workspaceDir, ledger, pending, total: sections.length, signal, onActivity,
      onChecked: () => onProgress(done(), sections.length) });
  }
  writeWorkspaceFile(workspaceDir, LEDGER_FILE, buildLedgerMarkdown(sections, ledger));
  const failed = Object.keys(ledger.failures).length;
  reportExtraction(onActivity, sections.length, [], { label: failed ? `小节事实核对完成，${failed} 节核对失败交由主 Agent 处理` : '小节事实核对完成', done: true });
  return ledger;
}

// Single-round audit handles internal contradictions and conflicts with global facts only; the primary agent compares the ledger and repairs through repair-sections.
function buildConsistencyPrompt(state, { hasKnowledgeBase, workspaceDir }) {
  if (state.status === 'completed') return 'Consistency audit is complete. Preserve the existing body and result manifest, read 正文生成结果.json and set task_complete=true. Do not repeat the audit, repair or word adjustment.';
  const incremental = auditScope(workspaceDir).references.length > 0;
  return `Perform the full-document consistency audit and repair in one pass, not multiple rounds. Only address contradictions within or across sections, and conflicts between the body and global facts. The program has ${incremental ? 'checked this batch’s new sections and summarized completed sections as read-only references' : 'checked each target section in parallel'} in ${LEDGER_FILE}, including conflicts with global facts, internal contradictions and comparable facts grouped by category.
${incremental ? 'This is an audit of new sections: audit and edit only this batch’s target sections. Completed sections labeled “参考·只读” in the ledger are read-only comparison material. When a new section conflicts with a reference section, edit the new section to match.\n' : ''}1. Read 全局事实设定.md and the ledger. Choose how to read the ledger, possibly by category, but cover every issue and all categories of facts. You need not read every section in full. If the ledger lists sections whose checks failed, their issues and facts are absent: call recheck-sections first (you may fix the section HTML before rechecking when the error identifies it). If rechecking still fails, read the original section file and inspect facts and issues yourself; include its ID in manually_checked_section_ids when submitting.
2. Review section issues in the ledger and discard differences caused by different subjects, conditions or stages. Compare facts across sections by category to find conflicting values or mutually exclusive statements: quantities, dates, periods, frequencies, deadlines, locations, amounts, technical parameters, identifiers, names or responsible parties. When original wording needs verification, use search-sections with keywords to locate the specific paragraphs or read individual section files. Do not read every section in full or search repeatedly for synonymous wording.
3. Resolve values: global facts take precedence for conflicts with them. Where global facts are silent, consult 项目概述.md, 招标文件关键信息.md${hasKnowledgeBase ? ' and the knowledge base' : ''} as references. If no source can confirm a value or sources conflict, choose one reasonable consistent value. The audit aims for a consistent, noncontradictory body; outside materials are references, and lack of evidence alone is not a reason to retain contradictions.
4. These are not issues and must not be changed: differences in wording, labels, phrasing or detail; additions not mentioned in global facts, such as roles, processes, deliverables, frequencies and commitments, if they do not conflict with global facts or other content; strength of commitment language; style and polishing. Do not audit whether content is supported by references or withdraw or weaken commitments. Address only contradictions affecting comprehension or project implementation.
5. Once a consistent conclusion is established, write sections needing changes to ${taskFilePath('repair')} as {"rules":"optional shared repair rules","sections":[{"section_id":"section ID","instructions":"specific contradiction and resolution"}]}, then call repair-sections. Copy section_id exactly from the ledger section directory${incremental ? '; submit only this batch’s target sections' : ''}. Write the file before submitting it to the tool. When several sections need the same value, put the chosen value and scope in rules and list affected sections; their instructions may be empty, and each subtask applies the shared rule. For isolated contradictions, specify the paragraph ID, contradiction and resolution in the section instructions. Subtasks follow the chosen conclusion rather than choosing different values. Use repair-sections for more than five sections; for five or fewer, direct edits are allowed using the same conclusion.
6. repair-sections reports counts and unsuccessful items. 程序清单/一致性修复结果.json accumulates dispatched results by section: summary contains repaired and unsuccessful counts, status is the most recent result, and changes records text before and after edits. Read as needed to verify results. Fix and redispatch unexecuted items (IDs outside current targets, already being edited or lacking instructions) as directed. Report unresolved items accurately; after this pass the common submission validation decides whether further repair is required. The task file is the current dispatch: before redispatch rewrite it for failed, unexecuted or clearly missed sections; do not redispatch fixed sections. Multiple sequential batches are allowed.
7. After handling and verifying actual results, call complete-consistency-round with task_complete=true to submit the conclusion. The program validates it and common rules decide whether to continue repair or finish the audit and advance. remaining_issues records only contradictions genuinely unfixable this run${incremental ? ', such as conflicts between reference sections or between references and global facts' : ''}. Submit directly if the targets have no issues.
Do not modify inserted image blocks, captions, prompts, references, ordering or image table layouts. The program checks them section by section and returns original blocks for exact restoration if changed. Ordinary text may be edited; preserve original tables and substantive information. Do not check or adjust total word count. Keep body content in its original section HTML and do not modify input materials, the ledger, other sections or the business database.`;
}

// Aggregate unfinished repair/check targets; permitted remaining_issues do not introduce new failure conditions.
function collectConsistencySubmissionIssues(workspaceDir, state) {
  if (!state.submission) return [];
  const scope = auditScope(workspaceDir);
  const byId = new Map(scope.sections.map(section => [section.id, section]));
  const issues = (state.failed_sections || []).map(id => {
    const section = byId.get(id);
    return { severity: 'quality', type: 'consistency-repair', section_id: id,
      file: section.file, number: section.number, title: section.title, fixable: false,
      message: `小节 ${section.number} ${section.title} 的一致性修复尚未成功，请按已确定的统一结论继续处理并提交真实结果。` };
  });
  const ledger = readLedger(workspaceDir);
  const manual = new Set(state.submission.manually_checked_section_ids || []);
  for (const section of scope.sections) {
    if (ledger.sections?.[section.id] || manual.has(section.id)) continue;
    issues.push({ severity: 'quality', type: 'consistency-check', section_id: section.id,
      file: section.file, number: section.number, title: section.title, fixable: false,
      message: `小节 ${section.number} ${section.title} 尚无核对结果；可重新核对，或读取原文自行核对后在 manually_checked_section_ids 中列出。` });
  }
  return issues;
}

// The primary agent searches, rechecks, dispatches repairs, and submits conclusions; persist child failures with the session.
// Re-register protection with protectLedger after programmatic ledger writes; failTask ends the whole task on consecutive upstream failures instead of repeated agent retries.
function createContentGenerationConsistencyTools({ agentService, aiService, signal, activity, inspectSection, onActivity, consistency, protectLedger = () => {}, failTask = () => {} }, { Type, workspaceDir }) {
  const result = details => ({ content: [{ type: 'text', text: JSON.stringify(details) }], details });
  const read = file => fs.readFileSync(path.join(workspaceDir, file), 'utf8');
  function requireAuditing() {
    const state = consistency.get();
    if (!state || state.status !== 'running') throw new Error('当前不在可修复的一致性审计阶段');
    return state;
  }
  return [{
    name: 'search-sections', label: '检索正文小节',
    description: '在本轮目标小节及已完成参考小节的最新正文纯文本中按关键词检索段落，任一关键词命中即返回小节及段落 ID，用于定位具体矛盾；参考小节结果标记 reference=true，只读。检索文本不含 HTML 标记和图片提示词。',
    parameters: Type.Object({
      keywords: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, description: '关键词，按原文字面匹配，不支持正则。' }),
      section_ids: Type.Optional(Type.Array(Type.String(), { description: '可选，限定检索的小节 ID；不填检索全部审计范围。' })),
    }),
    async execute(_callId, params) {
      const scope = params.section_ids?.length ? new Set(params.section_ids) : null;
      const keywords = params.keywords.map(keyword => keyword.toLowerCase());
      const matches = [];
      let total = 0;
      for (const section of auditScope(workspaceDir).sections) {
        if (scope && !scope.has(section.id)) continue;
        for (const block of auditBlocks(read(section.file))) {
          const lower = block.text.toLowerCase();
          const positions = keywords.map(keyword => lower.indexOf(keyword)).filter(index => index >= 0);
          if (!positions.length) continue;
          total += 1;
          if (matches.length >= SEARCH_LIMIT) continue;
          const start = Math.max(0, Math.min(...positions) - SNIPPET_LENGTH / 2);
          const text = block.text.length <= SNIPPET_LENGTH ? block.text
            : `${start ? '…' : ''}${block.text.slice(start, start + SNIPPET_LENGTH)}${start + SNIPPET_LENGTH < block.text.length ? '…' : ''}`;
          matches.push({ section_id: section.id, number: section.number, title: section.title, block_id: block.id, text, ...(section.reference ? { reference: true } : {}) });
        }
      }
      return result({ total, truncated: total > matches.length, matches });
    },
  }, {
    // The primary agent decides when to retry failed programmatic checks and may correct section HTML first.
    name: 'recheck-sections', label: '重新核对小节', executionMode: 'sequential',
    description: '对台账“核对失败的小节”重新执行程序核对；失败原因指向本节 HTML 时可先修正再核对。只处理审计范围内尚无核对结果的小节，成功后问题和事实写入台账并更新台账文件。返回 total、success 和 unresolved（未执行或仍失败的小节及原因）；仍失败时读取原小节文件自行核对，并在 complete-consistency-round 的 manually_checked_section_ids 中列出。',
    parameters: Type.Object({
      section_ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true, description: '从台账“核对失败的小节”原样复制的小节 ID。' }),
    }, { additionalProperties: false }),
    async execute(_callId, params, toolSignal) {
      requireAuditing();
      const { sections } = auditScope(workspaceDir);
      const byId = new Map(sections.map(section => [section.id, section]));
      const ledger = readLedger(workspaceDir);
      ledger.failures ||= {};
      const skipped = new Map();
      const pending = [];
      for (const id of params.section_ids) {
        if (!byId.has(id)) skipped.set(id, `未执行：小节 ID 不属于审计范围：${id}。请从台账“小节目录”原样复制小节 ID。`);
        else if (ledger.sections[id]) skipped.set(id, '未执行：该小节已有核对结果，无需重新核对。');
        else pending.push(byId.get(id));
      }
      try {
        if (pending.length) {
          await checkLedgerSections({ aiService, workspaceDir, ledger, pending, total: sections.length, signal: AbortSignal.any([signal, toolSignal].filter(Boolean)), onActivity });
        }
      } catch (error) {
        if (error?.code === AI_UPSTREAM_UNAVAILABLE) failTask(error);
        throw error;
      } finally {
        writeWorkspaceFile(workspaceDir, LEDGER_FILE, buildLedgerMarkdown(sections, ledger));
        protectLedger();
      }
      reportExtraction(onActivity, sections.length, [], { label: '小节事实核对完成', done: true });
      const results = params.section_ids.map(id => skipped.has(id) ? { section_id: id, status: 'error', error: skipped.get(id) }
        : ledger.sections[id] ? { section_id: id, status: 'success' } : { section_id: id, status: 'error', error: ledger.failures[id] || '核对未完成' });
      return result({ total: results.length, success: results.filter(item => item.status === 'success').length,
        unresolved: results.filter(item => item.status !== 'success') });
    },
  }, {
    // Read tasks from the fixed task file and dispatch in order; sections within a dispatch repair concurrently.
    name: 'repair-sections', label: '并发修复一致性问题', executionMode: 'sequential',
    description: `主 Agent 确定统一结论后，读取 ${taskFilePath('repair')} 中需要修改的目标小节，分配给子任务并发修复。格式为 {"rules":"可选，统一修复规则","sections":[{"section_id":"从台账“小节目录”原样复制的本轮目标小节 ID","instructions":"本节具体矛盾：段落 ID、矛盾内容及统一结论；只需按 rules 修改时填空字符串"}]}。rules 适用于本次派发的每个小节：同一取值需要在多个小节统一时写明统一后的取值及适用范围，子任务在各自小节按规则修改相关表述。${TASK_FILE_WRITING}文件内容即本次派发的任务，再次派发前按需改写。各子任务原生 edit 自己的小节，只改与矛盾直接相关的内容，保留图片，不检查或调整字数。返回 total、success 和 unresolved：ID 错误、参考小节、正在编辑或缺少要求的项未执行并说明原因，其他小节照常修复，未成功项返回主 Agent，在本轮提交时统一处理；程序清单/一致性修复结果.json 按小节累积本轮各次派发的最新状态及成功项的 changes（改动段落修改前后的纯文本）。`,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_callId, _params, toolSignal, onUpdate) {
      requireAuditing();
      const params = readTaskFile(workspaceDir, 'repair');
      // Planning is incomplete at tool registration; read final targets at repair time, keeping reference sections read-only.
      const { targets: targetList, references } = auditScope(workspaceDir);
      const targets = new Map(targetList.map(section => [section.id, section]));
      const referenceIds = new Set(references.map(section => section.id));
      const rules = params.rules?.trim() || '';
      activity.editing ||= new Set();
      // At the model input boundary, merge same-section requirements and return invalid IDs, references, in-progress edits, and missing requirements individually without failing other sections.
      const order = [];
      const requests = new Map();
      const skipped = new Map();
      for (const job of params.sections) {
        const id = job.section_id.trim();
        if (!order.includes(id)) order.push(id);
        if (referenceIds.has(id)) skipped.set(id, '未执行：该小节为已完成的参考小节，本轮只修改新增小节；请调整新增小节与其保持一致。');
        else if (!targets.has(id)) skipped.set(id, unknownSectionMessage(id, targets));
        else requests.set(id, [...(requests.get(id) || []), job.instructions.trim()].filter(Boolean));
      }
      const jobs = [];
      for (const [id, parts] of requests) {
        if (activity.editing.has(id)) skipped.set(id, '未执行：该小节正在其他批次中修复，请等待该批结束后再派发。');
        else if (!parts.length && !rules) skipped.set(id, '未执行：instructions 为空且本批未提供 rules，缺少修复要求。');
        else jobs.push({ section_id: id, instructions: parts.join('\n') || RULE_CHECK_INSTRUCTIONS });
      }
      const ids = jobs.map(job => job.section_id);
      const before = new Map(ids.map(id => [id, read(targets.get(id).file)]));
      // Register pending work first so it survives cancellation/resume; concurrent batches add/remove only their sections using the latest state.
      const registered = consistency.get();
      consistency.save({ ...registered, failed_sections: [...new Set([...(registered.failed_sections || []), ...ids])] });
      const { results: edited, restored } = jobs.length ? await editContentSections({ jobs, targets, workspaceDir, agentService, signal, toolSignal, activity, inspectSection,
        onActivity: (event) => {
          // Preserve existing business progress and log updates.
          onActivity?.(event);

          // Refresh the primary agent timer through tool progress when consistency-repair children finish.
          if (event.progress?.step !== 'consistency-repair') return;

          for (const item of event.progress.items) {
            if (!['success', 'error', 'cancelled'].includes(item.status)) {
              continue;
            }

            onUpdate?.(result({
              section_id: item.id,
              status: item.status,
            }));
          }
        },
        title: '一致性修复', preloadInput: true, instructions: `${REPAIR_INSTRUCTIONS}${rules ? `\n本批统一修复规则（适用于本批每个小节，按语义判断本节全文中的相关表述）：\n${rules}` : ''}`,
      }) : { results: [], restored: [] };
      const succeeded = new Set(edited.filter(item => item.status === 'success').map(item => item.section_id));
      const latest = consistency.get();
      // Persist repaired sections so round progress remains known after pause, failure, or restart.
      consistency.save({ ...latest, failed_sections: (latest.failed_sections || []).filter(id => !succeeded.has(id)),
        repaired_section_ids: [...new Set([...(latest.repaired_section_ids || []), ...succeeded])] });
      const byId = new Map(edited.map(item => [item.section_id, item.status === 'success'
        ? { ...item, changes: blockChanges(before.get(item.section_id), read(targets.get(item.section_id).file)) } : item]));
      const results = order.map(id => byId.get(id) || { section_id: id, status: 'error', error: skipped.get(id) });
      // Accumulate growing change comparisons by section in the program manifest; send the model only batch statistics and unsuccessful items.
      const file = writeListFile(workspaceDir, 'repair', mergeRepairResults(readListFile(workspaceDir, 'repair'), results));
      return { content: [{ type: 'text', text: JSON.stringify(batchResponse(results, restored, { detail_file: file })) }], details: { results, restored } };
    },
  }, {
    name: 'complete-consistency-round', label: '提交一致性审计结论', executionMode: 'sequential',
    description: '本轮处理后提交真实审计结论，由程序统一校验；接受后结束审计并进入后续流程。',
    parameters: Type.Object({
      summary: Type.String(),
      remaining_issues: Type.Array(Type.String(), { description: '只记录确实无法在本轮修复的矛盾，注明小节、证据和原因；可以统一的矛盾须在提交前修复。为空表示本次目标内无已知未解决矛盾。' }),
      manually_checked_section_ids: Type.Optional(Type.Array(Type.String(), { description: '台账“核对失败的小节”中，重新核对仍未成功、已由你读取原文自行核对问题和事实的小节 ID；没有核对失败的小节时不填。' })),
    }),
    async execute(_callId, params) {
      const state = requireAuditing();
      if (activity.pending) throw new Error('请等待全部并发任务结束');
      // Record only this round's conclusion; end auditing after shared submission checks accept it.
      consistency.save({ ...state, submission: params });
      return result({ submitted: true });
    },
  }];
}

module.exports = { CONSISTENCY_TOOLS, LEDGER_FILE, LEDGER_JSON, sectionAuditText, extractConsistencyLedger, buildConsistencyPrompt, collectConsistencySubmissionIssues, createContentGenerationConsistencyTools };
