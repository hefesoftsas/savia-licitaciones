// Blind-bid AI review protocol: agent JSON output, submission validation, final issues, repair scope, pending repair list, and item-by-item reconciliation.
// Pure functions only, with no Electron dependency; see blindCheckAgent.cjs for orchestration.
const Ajv = require('ajv');
const { normalizeForMatch, verifyEvidence } = require('./blindCheckPresetExtraction.cjs');

const REVIEW_OUTPUT_FILE = '复核结果.json';
const DISPOSITION_OUTPUT_FILE = '处理结果.json';
const CATEGORIES = ['privacy', 'structure', 'page', 'paragraph', 'font', 'text', 'table', 'consistency', 'image'];
const SEVERITIES = ['high', 'medium', 'low'];
const CLAUSE_STATUSES = ['pass', 'fail', 'unknown'];
const VERDICTS = ['problem', 'not_problem', 'uncertain'];
const MAX_PENDING_SAMPLES = 6;
const MAX_OPEN_LOCATIONS = 30;
const IMAGE_PART_LABELS = { alt: '（图片名称或替代文字）', content: '（图片画面）' };
// Minimum consecutive matching characters for coverage between manual-review clauses and clause comparisons.
const COVERAGE_WINDOW = 6;

const shortText = (maxLength) => ({ type: 'string', minLength: 1, maxLength });

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'clauses', 'candidates', 'issues'],
  properties: {
    summary: shortText(400),
    clauses: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'requirement', 'basis', 'status', 'explanation', 'issues'],
        properties: {
          id: { type: 'string', pattern: '^c[0-9]+$' },
          requirement: shortText(120),
          basis: shortText(300),
          status: { enum: CLAUSE_STATUSES },
          explanation: shortText(400),
          issues: { type: 'array', maxItems: 40, items: { type: 'string', minLength: 1 } },
        },
      },
    },
    candidates: {
      type: 'array',
      maxItems: 2000,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'verdict', 'reason'],
        properties: {
          id: { type: 'string', pattern: '^g[0-9]+(#[0-9]+)?$' },
          verdict: { enum: VERDICTS },
          reason: shortText(300),
        },
      },
    },
    issues: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'severity', 'category', 'basis', 'detail', 'suggestion', 'locations'],
        properties: {
          id: { type: 'string', pattern: '^a[0-9]+$' },
          title: shortText(80),
          severity: { enum: SEVERITIES },
          category: { enum: CATEGORIES },
          basis: shortText(300),
          detail: shortText(400),
          suggestion: shortText(300),
          // An empty array represents a document-wide issue, such as missing module-based file splitting, with no specific paragraph.
          locations: {
            type: 'array',
            maxItems: 30,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['target', 'text'],
              properties: {
                target: { type: 'string', minLength: 1, maxLength: 40 },
                text: { type: 'string', maxLength: 300 },
                // Image location is required: alt quotes an image name or alternative text; content refers to text or logos within the image.
                image_part: { enum: ['alt', 'content'] },
              },
            },
          },
        },
      },
    },
  },
};

const DISPOSITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'items', 'clauses'],
  properties: {
    summary: shortText(400),
    items: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'action', 'reason', 'suggestion'],
        properties: {
          id: { type: 'string', pattern: '^(g|a)[0-9]+$' },
          action: { enum: ['fixed', 'manual'] },
          reason: { type: 'string', maxLength: 300 },
          suggestion: { type: 'string', maxLength: 300 },
        },
      },
    },
    clauses: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status', 'explanation'],
        properties: {
          id: { type: 'string', pattern: '^c[0-9]+$' },
          status: { enum: CLAUSE_STATUSES },
          explanation: shortText(400),
        },
      },
    },
  },
};

const ajv = new Ajv({ allErrors: true, strict: true });
const validateReviewSchema = ajv.compile(REVIEW_SCHEMA);
const validateDispositionSchema = ajv.compile(DISPOSITION_SCHEMA);

function blocking(message, extra = {}) {
  return { severity: 'blocking', message, ...extra };
}

function parseJson(content, file) {
  const text = String(content || '').trim();
  if (!text) return { issues: [blocking(`${file} 未生成或内容为空，请写入完整 JSON`, { file })] };
  try {
    return { value: JSON.parse(text), issues: [] };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { issues: [blocking(`${file} 不是合法 JSON：${error.message}`, { file })] };
  }
}

function schemaIssues(validate, value, file) {
  if (validate(value)) return [];
  return validate.errors.slice(0, 20).map((item) => blocking(`${file} 结构无效：${item.instancePath || '/'} ${item.message}`, { file, path: item.instancePath || '/' }));
}

/** Issue reconciliation key matches the helper's grouping key (rule + severity + conclusion + candidate flag) to align equivalent issues before and after repair. */
function groupKey(group) {
  return `${group.ruleId}\u0001${group.severity}\u0001${group.message}\u0001${group.candidate ? 1 : 0}`;
}

function countByKey(groups) {
  const counts = new Map();
  for (const group of groups || []) counts.set(groupKey(group), (counts.get(groupKey(group)) || 0) + Number(group.count || 0));
  return counts;
}

// Inline structure-export annotations (region, heading level, fields, images, text boxes, page/section breaks) are not source text; remove before quote checks.
// Recognize only these fixed forms; retain brackets originally in the document, such as bracketed years in document numbers.
const DUMP_ANNOTATION = /〔(?:封面|目录|标题\d+|段前分页|空段|文本框内|分页符|分节符|域：[^〕]*|文本框：[^〕]*|img\d+(?:、img\d+)*)〕/g;

/** Split bid structure text into a Map from paragraph number to source text, removing annotations while preserving ⏎ ⇥ ◇ placeholders. */
function parseDumpParagraphs(dumpText) {
  const paragraphs = new Map();
  for (const line of String(dumpText || '').split(/\r?\n/)) {
    // Footnote/endnote IDs use fn.1 / en.1, with a dot after the letters.
    const match = line.match(/^\[([a-z]+\.?[0-9][0-9a-z.]*)\] (.*)$/);
    if (match && !match[1].startsWith('img')) paragraphs.set(match[1], match[2].replace(DUMP_ANNOTATION, '').trim());
  }
  return paragraphs;
}

function imageIdsOf(images) {
  return new Set((images || []).map((image) => image.id));
}

function quality(message, extra = {}) {
  return { severity: 'quality', message, ...extra };
}

/** Candidate coverage: each group needs a group conclusion or conclusions for every location; entries beyond the item limit require a group conclusion. */
function candidateCoverage(groups, verdicts) {
  const missing = [];
  for (const group of groups) {
    if (!group.candidate) continue;
    if (verdicts.has(group.id)) continue;
    const uncovered = group.items.filter((_item, index) => !verdicts.has(`${group.id}#${index}`)).length + Math.max(0, group.count - group.items.length);
    if (uncovered > 0) missing.push(`${group.id}（${group.message}，${uncovered} 处没有结论）`);
  }
  return missing;
}

/**
 * Verify a bid quote against paragraph source text without annotations; allow full quotes of very short paragraphs, such as a footer containing only page number 2.
 * Correct a wrong paragraph number when the quote occurs in exactly one other paragraph. Return the mismatch reason or empty on success.
 */
function checkLocation(location, paragraphs, imageIds) {
  if (imageIds.has(location.target)) {
    if (location.image_part) return '';
    location.image_part = 'content';
    return `图片位置 ${location.target} 没写 image_part，已按图片画面处理；摘录的是名称或替代文字时写 alt`;
  }
  const paragraph = paragraphs.get(location.target);
  if (paragraph === undefined) return `${location.target} 不是标书正文里的段落或图片编号`;
  const wanted = normalizeForMatch(location.text);
  const own = normalizeForMatch(paragraph);
  if (!wanted) return `在 ${location.target} 没有摘录标书原文`;
  if (wanted.length < 2 && wanted !== own) return `在 ${location.target} 的摘录太短，至少 2 个字，或整段引用`;
  if (own.includes(wanted)) return '';
  const elsewhere = [...paragraphs.entries()].filter(([, value]) => normalizeForMatch(value).includes(wanted)).map(([target]) => target);
  if (elsewhere.length === 1) {
    location.target = elsewhere[0];
    return '';
  }
  return elsewhere.length
    ? `摘录的「${location.text.slice(0, 30)}」不在 ${location.target}，在 ${elsewhere.slice(0, 3).join('、')} 等 ${elsewhere.length} 段都有，请写明是哪一段`
    : `摘录的「${location.text.slice(0, 30)}」在 ${location.target} 中找不到（〔〕里的是标注，不是原文），请逐字摘录标书原文`;
}

/**
 * A manual-review preset clause is covered when clause evidence or requirements share at least six consecutive characters.
 * This also matches tender sentences split into several clauses or summarized requirements.
 */
function uncoveredManualItems(manualItems, clauses) {
  const covered = clauses.map((clause) => normalizeForMatch(`${clause.basis}${clause.requirement}`));
  return (manualItems || []).filter((item) => {
    const whole = normalizeForMatch(item);
    if (whole.length < COVERAGE_WINDOW) return false;
    for (let start = 0; start + COVERAGE_WINDOW <= whole.length; start += 1) {
      const piece = whole.slice(start, start + COVERAGE_WINDOW);
      if (covered.some((text) => text.includes(piece))) return false;
    }
    return true;
  });
}

/**
 * Validate review submissions: structural errors, nonexistent issue references, and candidates without conclusions block acceptance and require correction.
 * Missing source evidence, unverifiable bid quotes, and manual-review clauses without conclusions are quality issues only.
 * Accept after one or two unsuccessful correction rounds, marking unmatched evidence and locations unverified so one quote cannot derail the review.
 */
function validateReviewOutput(content, context) {
  const parsed = parseJson(content, REVIEW_OUTPUT_FILE);
  if (!parsed.value) return { value: null, issues: parsed.issues };
  const review = parsed.value;
  const issues = schemaIssues(validateReviewSchema, review, REVIEW_OUTPUT_FILE);
  if (issues.length) return { value: null, issues };

  const groups = context.groups || [];
  const groupIds = new Set(groups.map((group) => group.id));
  const paragraphs = context.paragraphs || new Map();
  const imageIds = context.imageIds || new Set();
  const referenceText = normalizeForMatch(context.referenceText || '');
  const referenceLabel = context.hasTender ? '招标文件' : '格式预设的条款依据';
  const verifyBasis = (basis) => !referenceText || verifyEvidence(basis, referenceText);

  const seen = new Set();
  const duplicate = (id) => {
    if (seen.has(id)) return true;
    seen.add(id);
    return false;
  };

  const issueIds = new Set();
  for (const item of review.issues) {
    if (duplicate(item.id)) issues.push(blocking(`问题编号 ${item.id} 重复`));
    issueIds.add(item.id);
    if (!verifyBasis(item.basis)) {
      item.basisUnverified = true;
      issues.push(quality(`问题 ${item.id} 的 basis 在${referenceLabel}中找不到，请逐字摘录原文：${item.basis.slice(0, 40)}`));
    }
    for (const location of item.locations) {
      const problem = checkLocation(location, paragraphs, imageIds);
      if (!problem) continue;
      if (!problem.startsWith('图片位置')) location.unverified = true;
      issues.push(quality(`问题 ${item.id}：${problem}`));
    }
  }

  for (const clause of review.clauses) {
    if (duplicate(clause.id)) issues.push(blocking(`条款编号 ${clause.id} 重复`));
    if (!verifyBasis(clause.basis)) {
      clause.basisUnverified = true;
      issues.push(quality(`条款 ${clause.id} 的 basis 在${referenceLabel}中找不到，请逐字摘录原文：${clause.basis.slice(0, 40)}`));
    }
    const unknown = clause.issues.filter((id) => !groupIds.has(id) && !issueIds.has(id));
    if (unknown.length) issues.push(blocking(`条款 ${clause.id} 引用的问题编号不存在：${unknown.join('、')}（程序问题用 g 编号，补充问题用 a 编号）`));
    if (clause.status === 'fail' && clause.issues.length === 0) issues.push(blocking(`条款 ${clause.id} 判为不符合，issues 里要列出对应的程序问题或补充问题编号`));
  }

  for (const item of uncoveredManualItems(context.manualItems, review.clauses)) {
    issues.push(quality(`格式要求里需人工核对的条款「${String(item).slice(0, 60)}」在条款对照里没有对应结论，请补一条（basis 逐字摘录招标原文）`));
  }

  const verdicts = new Map();
  for (const item of review.candidates) {
    const [groupId, index] = item.id.split('#');
    const group = groups.find((entry) => entry.id === groupId);
    if (!group || !group.candidate) {
      issues.push(blocking(`候选判定 ${item.id} 不是候选问题，只能对程序检查结果里 candidate 为 true 的问题下结论`));
      continue;
    }
    if (index !== undefined && Number(index) >= group.items.length) {
      issues.push(blocking(`候选判定 ${item.id} 超出 ${groupId} 的定位条目范围（共 ${group.items.length} 条）`));
      continue;
    }
    if (verdicts.has(item.id)) issues.push(blocking(`候选判定 ${item.id} 重复`));
    verdicts.set(item.id, { verdict: item.verdict, reason: item.reason });
  }
  const missing = candidateCoverage(groups, verdicts);
  if (missing.length) issues.push(blocking(`以下候选问题还没有结论，请逐条或整组判定：${missing.slice(0, 10).join('；')}`));

  if (issues.some((issue) => issue.severity === 'blocking')) return { value: null, issues };
  return {
    value: {
      summary: review.summary,
      clauses: review.clauses,
      verdicts: Object.fromEntries(verdicts),
      issues: review.issues,
    },
    issues,
  };
}

/** Count candidate groups in three review-conclusion categories; without a conclusion, count every candidate as an issue. */
function candidateCounts(group, verdicts) {
  const counts = { problem: 0, not_problem: 0, uncertain: 0 };
  if (!group.candidate || !verdicts) {
    counts.problem = Number(group.count || 0);
    return counts;
  }
  const groupVerdict = verdicts[group.id]?.verdict || 'problem';
  const items = group.items || [];
  items.forEach((_item, index) => {
    counts[verdicts[`${group.id}#${index}`]?.verdict || groupVerdict] += 1;
  });
  counts[groupVerdict] += Math.max(0, Number(group.count || 0) - items.length);
  return counts;
}

/** Conclusion for candidate index: prefer the individual conclusion, then the group conclusion; otherwise count as an issue. */
function itemVerdict(group, index, verdicts) {
  return verdicts?.[`${group.id}#${index}`] || verdicts?.[group.id] || { verdict: 'problem', reason: '' };
}

/** Use a group repair method when all samples agree; otherwise return empty so each location provides its own method. */
function sharedHint(samples) {
  const hints = new Set((samples || []).map((sample) => sample.hint).filter(Boolean));
  return hints.size === 1 ? [...hints][0] : '';
}

function aiLocationOccurrence(location) {
  return {
    where: `${location.target}${IMAGE_PART_LABELS[location.image_part] || ''}`,
    text: location.text,
    notes: location.unverified ? ['位置未核实：摘录在该段找不到，请人工核对'] : [],
  };
}

/**
 * Final issues use reviewed inspection conclusions as the sole basis for inspection display, repair scope, and reconciliation; all counts are occurrences.
 * Pass review only when successful and its signature matches inspection; otherwise programmatic results are final and candidates count as issues.
 * Exclude locations classified as not issues; count and mark manual confirmations. Count added AI issues by location.
 * Attach failed tender clauses to related issues as requirements; unknown clauses and failed clauses whose linked issues were all dismissed
 * become manual-confirmation issues under Other. Do not display passing clauses.
 */
function buildIssueList(groups, review) {
  const verdicts = review?.verdicts;
  const issues = [];
  for (const group of groups || []) {
    const counts = candidateCounts(group, verdicts);
    const count = counts.problem + counts.uncertain;
    if (!count) continue;
    const samples = group.samples || [];
    const hint = sharedHint(samples);
    const occurrences = group.candidate && verdicts
      ? (group.items || []).flatMap((item, index) => {
        const verdict = itemVerdict(group, index, verdicts);
        if (verdict.verdict === 'not_problem') return [];
        const note = verdict.verdict === 'uncertain' ? `需人工确认：${verdict.reason}` : verdict.reason;
        return [{ where: item.where, text: item.text, notes: note ? [note] : [] }];
      })
      : samples.map((sample) => ({
        where: sample.where,
        text: sample.text,
        notes: [sample.detail, sample.origin ? `格式来自：${sample.origin}` : '', !hint && sample.hint ? `修改方法：${sample.hint}` : ''].filter(Boolean),
      }));
    issues.push({
      id: group.id,
      kind: 'rule',
      ruleId: group.ruleId,
      category: group.category,
      severity: group.severity,
      message: group.message,
      count,
      uncertain: counts.uncertain > 0,
      requirements: [],
      explanation: '',
      hint,
      occurrences,
      more: Math.max(0, count - occurrences.length),
    });
  }
  for (const issue of review?.issues || []) {
    issues.push({
      id: issue.id,
      kind: 'ai',
      ruleId: '',
      category: issue.category,
      severity: issue.severity,
      message: issue.title,
      count: Math.max(1, issue.locations.length),
      uncertain: false,
      requirements: [{ text: issue.basis, unverified: Boolean(issue.basisUnverified) }],
      explanation: issue.detail,
      hint: issue.suggestion,
      occurrences: issue.locations.length
        ? issue.locations.map(aiLocationOccurrence)
        : [{ where: '全文', text: '', notes: ['全文性质的问题，不对应具体段落'] }],
      more: 0,
    });
  }
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  for (const clause of review?.clauses || []) {
    if (clause.status === 'pass') continue;
    const requirement = { text: clause.basis, unverified: Boolean(clause.basisUnverified) };
    const linked = (clause.issues || []).map((id) => byId.get(id)).filter(Boolean);
    for (const issue of linked) {
      if (!issue.requirements.some((item) => item.text === requirement.text)) issue.requirements.push(requirement);
    }
    if (clause.status === 'fail' && linked.length) continue;
    issues.push({
      id: clause.id,
      kind: 'clause',
      ruleId: '',
      category: 'other',
      severity: 'low',
      message: clause.requirement,
      count: 1,
      uncertain: true,
      requirements: [requirement],
      explanation: clause.explanation,
      hint: '',
      occurrences: [],
      more: 0,
    });
  }
  return issues.sort((left, right) => SEVERITIES.indexOf(left.severity) - SEVERITIES.indexOf(right.severity));
}

/** Use review conclusions only when successful and matching the inspection signature; otherwise programmatic findings are final. */
function reviewForResult(result, reviewState) {
  return reviewState?.status === 'success' && reviewState.inputSignature && reviewState.inputSignature === result?.inputSignature
    ? reviewState.review || null
    : null;
}

/** Aggregate high, medium, and low risk by occurrence for inspection cards and before/after repair comparisons. */
function issueSummary(issues) {
  const summary = { high: 0, medium: 0, low: 0, total: 0 };
  for (const issue of issues || []) {
    summary[issue.severity] += issue.count;
    summary.total += issue.count;
  }
  return summary;
}

/** Repair scope includes issues covered by enabled options, plus issues without a repair option when AI repair is selected; exclude issues covered by disabled options. */
function fixScope(issues, { fixRules, fixableRules, ai }) {
  const selected = new Set(fixRules || []);
  return (issues || []).filter((issue) => (fixableRules.has(issue.ruleId) ? selected.has(issue.ruleId) : ai === true));
}

/**
 * Pending agent repairs include remaining programmatic issues, excluding dismissed candidates
 * and supported repairs the user did not select, plus AI-added issues. Locations use paragraph numbers from the repair copy.
 */
function buildOpenItems({ checkGroups, review, afterGroups, fixRules, fixableRules }) {
  const selected = new Set(fixRules || []);
  const afterByKey = new Map((afterGroups || []).map((group) => [groupKey(group), group]));
  const open = [];
  for (const group of checkGroups || []) {
    if (fixableRules.has(group.ruleId) && !selected.has(group.ruleId)) continue;
    const after = afterByKey.get(groupKey(group));
    const counts = candidateCounts(group, review?.verdicts);
    const remaining = Math.max(0, Number(after?.count || 0) - counts.not_problem);
    if (!remaining) continue;
    open.push({
      id: group.id,
      source: 'program',
      title: group.message,
      rule: group.ruleTitle,
      severity: group.severity,
      remaining,
      hint: (after?.samples || group.samples || []).map((sample) => sample.hint).find(Boolean) || '',
      locations: (after?.items || []).slice(0, MAX_OPEN_LOCATIONS).map((item) => ({ target: item.locator, where: item.where, text: item.text })),
      ...(group.candidate && review ? {
        verdicts: (group.items || []).map((item, index) => ({
          text: item.text,
          verdict: review.verdicts[`${group.id}#${index}`]?.verdict || review.verdicts[group.id]?.verdict || 'problem',
        })),
      } : {}),
    });
  }
  for (const issue of review?.issues || []) {
    open.push({
      id: issue.id,
      source: 'ai',
      title: issue.title,
      severity: issue.severity,
      detail: issue.detail,
      suggestion: issue.suggestion,
      locations: issue.locations,
    });
  }
  return open;
}

/** Validate repair submissions: exactly one conclusion per pending issue, reasons and instructions for manual handling, and existing clause IDs. */
function validateDispositionOutput(content, { openItems, clauses }) {
  const parsed = parseJson(content, DISPOSITION_OUTPUT_FILE);
  if (!parsed.value) return { value: null, issues: parsed.issues };
  const disposition = parsed.value;
  const issues = schemaIssues(validateDispositionSchema, disposition, DISPOSITION_OUTPUT_FILE);
  if (issues.length) return { value: null, issues };

  const openIds = new Set(openItems.map((item) => item.id));
  const seen = new Set();
  for (const item of disposition.items) {
    if (!openIds.has(item.id)) issues.push(blocking(`${item.id} 不在待处理问题里，只能对待处理问题.json 中的编号下结论`));
    if (seen.has(item.id)) issues.push(blocking(`${item.id} 重复`));
    seen.add(item.id);
    if (item.action === 'manual' && (!item.reason.trim() || !item.suggestion.trim())) {
      issues.push(blocking(`${item.id} 留给人工处理时 reason 和 suggestion 都要填写：为什么不能自动修改、人工应该怎么改`));
    }
  }
  const missing = [...openIds].filter((id) => !seen.has(id));
  if (missing.length) issues.push(blocking(`以下待处理问题还没有处理结论：${missing.join('、')}`));
  const clauseIds = new Set((clauses || []).map((clause) => clause.id));
  const unknown = disposition.clauses.filter((clause) => !clauseIds.has(clause.id)).map((clause) => clause.id);
  if (unknown.length) issues.push(blocking(`条款编号不存在：${unknown.join('、')}`));
  if (issues.length) return { value: null, issues };
  return { value: disposition, issues: [] };
}

/** New or increased issues after repair: groups and counts exceeding the recheck baseline. */
function newProblemGroups(baselineGroups, finalGroups) {
  const baseline = countByKey(baselineGroups);
  const added = [];
  for (const group of finalGroups || []) {
    const extra = Number(group.count || 0) - (baseline.get(groupKey(group)) || 0);
    if (extra > 0) added.push({ ...group, count: extra });
  }
  return added;
}

function imageText(image) {
  return normalizeForMatch(`${image?.name || ''}${image?.description || ''}${image?.title || ''}`);
}

/**
 * An AI issue location is resolved when its quoted bid text is absent from the final document.
 * Image locations can be checked only when quoting the name or alternative text (image_part=alt); clearing it resolves the issue.
 * Text or logos inside images cannot be fixed by text edits and always remain pending.
 */
function locationResolved(location, finalText, reviewImages, finalImages) {
  const wanted = normalizeForMatch(location.text);
  // A quote already unverifiable during inspection is not proven fixed simply because it is absent after repair.
  if (!wanted || location.unverified) return false;
  if (/^img[0-9]+$/.test(location.target)) {
    if (location.image_part !== 'alt') return false;
    const before = (reviewImages || []).find((item) => item.id === location.target);
    if (!before || !imageText(before).includes(wanted)) return false;
    return !(finalImages || []).some((item) => imageText(item).includes(wanted));
  }
  return !finalText.includes(wanted);
}

/**
 * Reconcile issues within this repair scope plus newly introduced ones, giving fixed and pending-manual occurrence counts without distinguishing programmatic from AI repairs.
 * Counts satisfy before + new = fixed + pending. Derive status from rechecks, not agent claims.
 * Compare programmatic counts by reconciliation key, excluding dismissed locations; evaluate AI issues by disappearance of quoted source text
 * and clause issues by updated passing conclusions. unavailable explains incomplete AI repair (failure or invalid session) in manual-handling reasons.
 */
function buildFixItems({ scope, checkGroups, review, finalGroups, newGroups, dispositions, edits, refreshedClauses, unavailable, finalDumpText, reviewImages, finalImages }) {
  const groupsById = new Map((checkGroups || []).map((group) => [group.id, group]));
  const aiIssuesById = new Map((review?.issues || []).map((issue) => [issue.id, issue]));
  const finalByKey = new Map((finalGroups || []).map((group) => [groupKey(group), group]));
  const clauseStatus = new Map((refreshedClauses || []).map((clause) => [clause.id, clause.status]));
  const finalText = normalizeForMatch(finalDumpText || '');
  const editsByIssue = new Map();
  for (const edit of edits || []) {
    if (!edit.issue) continue;
    editsByIssue.set(edit.issue, [...(editsByIssue.get(edit.issue) || []), edit]);
  }
  const sampleOccurrence = (sample) => ({ where: sample.where, text: sample.text, notes: sample.detail ? [sample.detail] : [] });

  const pendingReason = (issue, pending) => {
    const disposition = dispositions?.get(issue.id);
    if (issue.uncertain && !disposition) return { reason: '无法确定是否违反要求，需要人工确认', suggestion: issue.hint };
    if (disposition?.action === 'manual') return { reason: disposition.reason, suggestion: disposition.suggestion || issue.hint };
    if (disposition?.action === 'fixed') return { reason: `已尝试修改，复查仍有 ${pending} 处`, suggestion: issue.hint };
    if (unavailable) return { reason: `自动修复未完成：${unavailable}`, suggestion: issue.hint };
    return { reason: '自动修复无法处理', suggestion: issue.hint };
  };

  const items = (scope || []).map((issue) => {
    let pending = issue.count;
    let pendingOccurrences = issue.occurrences;
    if (issue.kind === 'rule') {
      const group = groupsById.get(issue.id);
      const counts = candidateCounts(group, review?.verdicts);
      const finalGroup = finalByKey.get(groupKey(group));
      pending = Math.min(Math.max(0, Number(finalGroup?.count || 0) - counts.not_problem), issue.count);
      // Rechecks do not know review conclusions; exclude dismissed locations by their source quotes instead of listing them for manual handling.
      const dismissed = new Set((group.candidate && review ? group.items || [] : [])
        .filter((_item, index) => itemVerdict(group, index, review.verdicts).verdict === 'not_problem')
        .map((item) => normalizeForMatch(item.text)));
      pendingOccurrences = (finalGroup?.samples || []).filter((sample) => !dismissed.has(normalizeForMatch(sample.text))).map(sampleOccurrence);
    } else if (issue.kind === 'ai') {
      const locations = aiIssuesById.get(issue.id)?.locations || [];
      const unresolved = finalDumpText ? locations.filter((location) => !locationResolved(location, finalText, reviewImages, finalImages)) : locations;
      pending = locations.length ? unresolved.length : issue.count;
      pendingOccurrences = locations.length ? unresolved.map(aiLocationOccurrence) : issue.occurrences;
    } else {
      pending = clauseStatus.get(issue.id) === 'pass' ? 0 : 1;
    }
    const reason = pending
      ? issue.kind === 'clause' ? { reason: '需要人工核对是否满足招标要求', suggestion: issue.explanation } : pendingReason(issue, pending)
      : { reason: '', suggestion: '' };
    return {
      id: issue.id,
      category: issue.category,
      severity: issue.severity,
      message: issue.message,
      count: issue.count,
      fixed: issue.count - pending,
      pending,
      isNew: false,
      reason: reason.reason,
      suggestion: reason.suggestion,
      pendingOccurrences: pending ? pendingOccurrences.slice(0, MAX_PENDING_SAMPLES) : [],
      edits: editsByIssue.get(issue.id) || [],
    };
  });

  (newGroups || []).forEach((group, index) => {
    items.push({
      id: `n${index}`,
      category: group.category,
      severity: group.severity,
      message: group.message,
      count: Number(group.count || 0),
      fixed: 0,
      pending: Number(group.count || 0),
      isNew: true,
      reason: '修复后新出现，请人工核对',
      suggestion: sharedHint(group.samples),
      pendingOccurrences: (group.samples || []).slice(0, MAX_PENDING_SAMPLES).map(sampleOccurrence),
      edits: [],
    });
  });
  return items;
}

/** Summarize post-repair risk using reconciled pending-manual occurrences, including newly introduced issues. */
function pendingSummary(items) {
  const summary = { high: 0, medium: 0, low: 0, total: 0 };
  for (const item of items || []) {
    summary[item.severity] += item.pending;
    summary.total += item.pending;
  }
  return summary;
}

module.exports = {
  CATEGORIES,
  DISPOSITION_OUTPUT_FILE,
  DISPOSITION_SCHEMA,
  REVIEW_OUTPUT_FILE,
  REVIEW_SCHEMA,
  buildFixItems,
  buildIssueList,
  buildOpenItems,
  candidateCounts,
  fixScope,
  groupKey,
  imageIdsOf,
  issueSummary,
  newProblemGroups,
  parseDumpParagraphs,
  pendingSummary,
  reviewForResult,
  validateDispositionOutput,
  validateReviewOutput,
};
