// Extract technical/blind-bid layout requirements from the tender document into a formatting preset.
// Locate formatting-clause excerpts locally by keyword and send only those to AI; validate result field types, ranges, and enums.
// Verify every evidence quote against the tender source; leave unstated formatting options unchecked and rely on consistency rules.
const { normalizeProfile } = require('./blindCheckPresets.cjs');

const FORMAT_KEYWORDS = /(宋体|仿宋|黑体|楷体|字体|字号|号字|[初小一二三四五六七八]号|行距|行间距|磅|页边距|边距|A4|纸张|首行缩进|缩进|段前|段后|页眉|页脚|页码|加粗|倾斜|斜体|下划线|排版|装订|黑白|彩色|空行)/g;
const CONTEXT_KEYWORDS = /(暗标|技术标|施工组织设计|投标文件)/;
const WINDOW_BEFORE = 12;
const WINDOW_AFTER = 28;
const MAX_WINDOWS = 6;
const MAX_EXCERPT_CHARS = 20000;
// Too few formatting terms indicate an unrelated excerpt; do not call AI.
const MIN_WINDOW_SCORE = 6;

const CHINESE_SIZES = {
  初号: 42, 小初: 36, 一号: 26, 小一: 24, 二号: 22, 小二: 18, 三号: 16, 小三: 15,
  四号: 14, 小四: 12, 五号: 10.5, 小五: 9, 六号: 7.5, 小六: 6.5, 七号: 5.5, 八号: 5,
};

const HEADING_LEVELS = ['1', '2', '3', '4'];

// Prohibitive and permissive wording determines boolean direction; remove negated permission phrases before testing for permission.
const NEGATION = /不得|不允许|不准|不应|不能|不可|禁止|严禁|不要|不宜|勿|不使用|不采用|不出现|不设|不编/;
const PERMISSION = /允许|可以|可|宜/;

/** Extractable fields: path, type, and description. Paths match the preset profile; types determine validation. */
const EXTRACTABLE_FIELDS = [
  ['page.paper', 'paper', '纸张大小：A4 / A3 / Letter'],
  ['page.margin_top_cm', 'margin', '上边距（厘米）'],
  ['page.margin_bottom_cm', 'margin', '下边距（厘米）'],
  ['page.margin_left_cm', 'margin', '左边距（厘米）'],
  ['page.margin_right_cm', 'margin', '右边距（厘米）'],
  ['body.font_cn', 'font', '正文中文字体'],
  ['body.font_en', 'font', '正文西文字体'],
  ['body.size_pt', 'size', '正文字号，照抄原文写法即可，如"四号""小四""10.5磅"'],
  ['body.line_rule', 'lineRule', '行距类型：exact（固定值）/ atLeast（最小值）/ multiple（倍数行距）'],
  ['body.line_pt', 'linePt', '固定值或最小值行距的磅数'],
  ['body.line_multiple', 'lineMultiple', '倍数行距的倍数，如 1.5'],
  ['body.first_line_indent_chars', 'indent', '首行缩进的字符数'],
  ['body.space_before_pt', 'spacing', '段前间距（磅），"0 行"填 0'],
  ['body.space_after_pt', 'spacing', '段后间距（磅），"0 行"填 0'],
  ['body.alignment', 'alignment', '正文对齐：left（左对齐）/ both（两端对齐）/ center / right'],
  ['body.allow_bold', 'allow', '正文加粗：原文禁止填 false，原文明确允许填 true'],
  ['body.allow_italic', 'allow', '倾斜：原文禁止填 false，原文明确允许填 true'],
  ['body.allow_underline', 'allow', '下划线：原文禁止填 false，原文明确允许填 true'],
  ['body.allow_color', 'allow', '彩色文字：原文要求黑色或禁止彩色填 false，原文明确允许彩色填 true'],
  ['body.allow_highlight', 'allow', '突出显示和字符底纹：原文禁止填 false，原文明确允许填 true'],
  ['body.allow_char_spacing', 'allow', '调整字符间距：原文禁止填 false'],
  ['body.allow_font_scaling', 'allow', '字符缩放：原文禁止填 false'],
  ['body.check_latin_size', 'boolean', '数字、英文字符的字体字号：原文写"数字、英文字符不做要求"填 false'],
  ...HEADING_LEVELS.flatMap((level) => [
    [`headings.${level}.font_cn`, 'font', `${level} 级标题中文字体`],
    [`headings.${level}.size_pt`, 'size', `${level} 级标题字号，照抄原文写法`],
    [`headings.${level}.bold`, 'boolean', `${level} 级标题是否加粗`],
  ]),
  ['table.font_cn', 'font', '表格内中文字体；原文写"同正文"时填正文字体'],
  ['table.size_pt', 'size', '表格内字号；原文写"同正文"时填正文字号'],
  ['table.first_line_indent_chars', 'indent', '表格内首行缩进字符数'],
  ['table.allow_bold', 'allow', '表格文字加粗：原文对表格单独规定时才填，禁止填 false，允许填 true；没有单独规定不要填（按正文要求）'],
  ['structure.forbid_header_content', 'forbid', '页眉：原文规定不得有页眉或页眉不得有内容填 true，原文允许或要求页眉写内容填 false'],
  ['structure.forbid_footer_content', 'forbid', '页脚：原文规定页脚不得有任何内容（含页码）填 true，原文允许页脚写内容填 false；原文写"页脚只准出现页码"时不填此项'],
  ['structure.page_number', 'pageNumber', '页码：forbid（不得出现页码）/ footer_only（页脚只准出现页码）/ any（允许或要求编页码，对页脚没有其他限制）'],
  ['structure.check_toc_present', 'toc', '目录：forbid（不得有目录）/ require（必须有目录）'],
  ['structure.heading_numbering', 'numbering', '标题序号：原文要求用阿拉伯数字分级编排（一级 1、二级 1.1、三级 1.1.1）时填 arabic'],
  ['structure.check_empty_paragraphs', 'forbid', '空行：原文不允许留空行或空白行填 true，原文明确允许填 false'],
  ['image.check_color', 'forbid', '图片、图表要求黑白或禁止彩色时填 true'],
];

const FIELD_TYPES = Object.fromEntries(EXTRACTABLE_FIELDS.map(([fieldPath, type]) => [fieldPath, type]));

/**
 * Use unchecked (null) for unstated numeric formatting fields and switches for text effects, header/footer content, blank lines, page numbers, and paper.
 * Do not inherit strict built-in defaults for these; keep preset defaults for identity and structural-trace checks.
 */
const CLEARED_WHEN_MISSING = [
  'page.paper', 'page.margin_top_cm', 'page.margin_bottom_cm', 'page.margin_left_cm', 'page.margin_right_cm',
  'body.font_cn', 'body.font_en', 'body.size_pt', 'body.line_pt', 'body.line_multiple', 'body.first_line_indent_chars',
  'body.space_before_pt', 'body.space_after_pt', 'body.alignment',
  'body.allow_bold', 'body.allow_italic', 'body.allow_underline', 'body.allow_color', 'body.allow_highlight',
  ...HEADING_LEVELS.flatMap((level) => [`headings.${level}.font_cn`, `headings.${level}.size_pt`, `headings.${level}.bold`]),
  'table.font_cn', 'table.size_pt', 'table.first_line_indent_chars',
  'structure.forbid_header_content', 'structure.forbid_footer_content', 'structure.check_empty_paragraphs', 'structure.page_number',
  'structure.heading_numbering',
];

const NUMBER_RANGES = {
  margin: [0.5, 10],
  size: [5, 42],
  linePt: [8, 100],
  lineMultiple: [1, 5],
  indent: [0, 8],
  spacing: [0, 100],
};

function countFormatKeywords(text) {
  return (String(text).match(FORMAT_KEYWORDS) || []).length;
}

/**
 * Locate formatting clauses by scoring windows around keyword-matching lines; add weight for blind-bid/technical-bid context.
 * Select the highest-scoring non-overlapping windows and concatenate in source order; return empty text when none are suitable.
 */
function locateFormatExcerpts(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const candidates = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!countFormatKeywords(lines[index])) continue;
    const start = Math.max(0, index - WINDOW_BEFORE);
    const end = Math.min(lines.length, index + WINDOW_AFTER);
    const text = lines.slice(start, end).join('\n');
    const score = countFormatKeywords(text) + (CONTEXT_KEYWORDS.test(text) ? 5 : 0);
    if (score >= MIN_WINDOW_SCORE) candidates.push({ start, end, score });
  }
  candidates.sort((left, right) => right.score - left.score || left.start - right.start);

  const picked = [];
  let chars = 0;
  for (const candidate of candidates) {
    if (picked.length >= MAX_WINDOWS) break;
    if (picked.some((item) => candidate.start < item.end && item.start < candidate.end)) continue;
    const length = lines.slice(candidate.start, candidate.end).join('\n').length;
    if (picked.length && chars + length > MAX_EXCERPT_CHARS) continue;
    picked.push(candidate);
    chars += length;
  }
  picked.sort((left, right) => left.start - right.start);
  const excerpts = picked.map((item) => ({ ...item, text: lines.slice(item.start, item.end).join('\n') }));
  return {
    excerpts,
    text: excerpts.map((item, index) => `【片段 ${index + 1}】\n${item.text}`).join('\n\n'),
  };
}

const SYSTEM_PROMPT = `你是招标文件格式条款的解析助手。用户会给你招标文件中与排版格式有关的若干片段，你要找出对【投标文件技术标（暗标、施工组织设计）】的排版格式要求，按指定字段整理成 JSON。

要求：
1. 只提取原文明确写出的要求。原文没写的字段不要出现，不要按惯例补默认值；原文写"不作要求""由投标人自定"的也不要出现。
2. 只提取对技术标/暗标/施工组织设计/投标文件正文的要求。招标文件自身的格式、商务标、资格审查文件的要求不要提取。
3. 字号照抄原文写法（如"四号""小四""10.5磅"），不要自己换算；页边距用厘米；段前段后"0 行"填 0。
4. 原文规定"二级及以下标题与正文相同"时，在 headings.2 至 headings.4 填写与正文相同的字号和加粗要求；原文规定表格字体"同正文"时，表格字段填写正文的字体字号；原文全文禁止加粗时，各级标题的 bold 也填 false；原文写"不允许字符间距缩放"一类表述时，body.allow_char_spacing 和 body.allow_font_scaling 都填 false；原文写"页脚只准出现页码"时 structure.page_number 填 footer_only；原文写"数字、英文字符不做要求"时 body.check_latin_size 填 false。
5. 允许类字段（allow_*）原文禁止填 false、原文明确允许也要填 true；页眉、页脚、空行字段原文禁止填 true、原文明确允许填 false。
6. 每个填写的字段都要给出 evidence：招标文件中的原文片段，逐字摘录包含该要求的完整分句（10～60 字），不要改写或拼接。
7. 无法用下列字段表达的格式要求（如标题居中、图表标题格式、封面封底格式、页数上限、装订、编制软件），把原文逐条写进 manual，每条不超过 80 字。

只输出 JSON，格式如下：
{
  "fields": {
    "body.size_pt": { "value": "四号", "evidence": "正文部分字体采用四号宋体" }
  },
  "manual": ["图表居中放置，所有边框采用0.5磅黑色单实直线"],
  "notes": "可选：原文表述含糊之处"
}`;

function buildExtractionMessages(excerptText) {
  const fieldList = EXTRACTABLE_FIELDS.map(([fieldPath, , description]) => `- ${fieldPath}：${description}`).join('\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        '请从下面的招标文件片段中提取技术标（暗标）的排版格式要求。',
        '',
        '可填写的字段：',
        fieldList,
        '',
        '=== 招标文件片段开始 ===',
        excerptText,
        '=== 招标文件片段结束 ===',
      ].join('\n'),
    },
  ];
}

function parseNumber(raw) {
  if (typeof raw === 'number') return raw;
  const match = String(raw ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function inRange(value, type) {
  const [min, max] = NUMBER_RANGES[type];
  return Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

function parseBoolean(raw) {
  if (typeof raw === 'boolean') return raw;
  const text = String(raw ?? '').trim().toLowerCase();
  if (['true', '是', 'yes', '1', '加粗', '允许'].includes(text)) return true;
  if (['false', '否', 'no', '0', '不加粗', '不允许', '禁止'].includes(text)) return false;
  return undefined;
}

/** Font size: convert Chinese named sizes first, checking small-four before four; otherwise use the numeric point value. Normalize the longer small-four form before matching four. */
function parseSize(raw) {
  if (typeof raw === 'number') return inRange(raw, 'size');
  const text = String(raw ?? '').replace(/小([初一二三四五六])号/g, '小$1');
  const name = Object.keys(CHINESE_SIZES).sort((left, right) => right.length - left.length).find((item) => text.includes(item));
  if (name) return CHINESE_SIZES[name];
  return inRange(parseNumber(text), 'size');
}

function parseMargin(raw) {
  const text = String(raw ?? '');
  const value = parseNumber(raw);
  return inRange(/毫米|mm/i.test(text) ? value / 10 : value, 'margin');
}

/** Convert an AI field value to its preset type; return undefined if conversion fails or the value is outside a reasonable range. */
function coerceValue(type, raw) {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const text = String(raw).trim();
  switch (type) {
    case 'paper': {
      const upper = text.toUpperCase();
      if (upper.includes('A4')) return 'A4';
      if (upper.includes('A3')) return 'A3';
      return upper.includes('LETTER') ? 'Letter' : undefined;
    }
    case 'margin':
      return parseMargin(raw);
    case 'size':
      return parseSize(raw);
    case 'linePt':
    case 'lineMultiple':
    case 'indent':
    case 'spacing':
      return inRange(parseNumber(raw), type);
    case 'lineRule':
      if (/exact|固定/.test(text)) return 'exact';
      if (/atleast|最小/i.test(text)) return 'atLeast';
      return /multiple|倍/.test(text) ? 'multiple' : undefined;
    case 'alignment':
      if (/both|justify|两端/.test(text)) return 'both';
      if (/left|左/.test(text)) return 'left';
      if (/center|居中/.test(text)) return 'center';
      return /right|右/.test(text) ? 'right' : undefined;
    case 'toc':
      if (/forbid|不得|禁止|不设/.test(text)) return 'forbid';
      return /require|必须|须有|应有/.test(text) ? 'require' : undefined;
    case 'numbering':
      return /arabic|阿拉伯|1\.1/i.test(text) ? 'arabic' : undefined;
    // Unrestricted page numbers are null in presets; test exclusive permission before prohibition or general permission.
    case 'pageNumber':
      if (/footer_only|只准|只允许|仅/.test(text)) return 'footer_only';
      if (/forbid|不得|禁止|不编|不允许/.test(text)) return 'forbid';
      return /any|允许|编制|连续/.test(text) ? null : undefined;
    case 'boolean':
    case 'allow':
      return parseBoolean(raw);
    // Prohibition fields: true means disallowed; prohibitive wording also maps to true.
    case 'forbid':
      if (typeof raw === 'boolean') return raw;
      if (/^(true|是|yes|1)$/i.test(text) || NEGATION.test(text)) return true;
      return /^(false|否|no|0)$/i.test(text) || /允许|可以/.test(text) ? false : undefined;
    case 'font': {
      const font = text.replace(/字体$/, '').trim();
      return font && font.length <= 30 && !/不作要求|自定|null/i.test(font) ? font : undefined;
    }
    default:
      return undefined;
  }
}

function normalizeForMatch(value) {
  // Retain decimal points to distinguish 1.5 from 15; normalize full-width periods to ASCII.
  return String(value || '').replace(/．/g, '.').replace(/[\s\u3000，,。、；;：:（）()“”"'‘’《》<>【】[\]—\-_·…!！?？/]/g, '');
}

/** Check evidence as a substring after removing whitespace and punctuation; for ellipsis-joined quotes, any matching segment of at least three characters suffices. */
function verifyEvidence(evidence, normalizedTender) {
  const pieces = String(evidence || '').split(/…+|\.{3,}|；|;/).map(normalizeForMatch).filter((item) => item.length >= 3);
  return pieces.some((piece) => normalizedTender.includes(piece));
}

const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** Possible numeric evidence forms: Arabic digits plus Chinese numerals for integers 0–10, including the alternative form of two. */
function numberForms(value) {
  const forms = [String(value)];
  if (Number.isInteger(value) && value >= 0 && value <= 10) forms.push(CHINESE_DIGITS[value]);
  if (value === 2) forms.push('两');
  return forms;
}

/**
 * Check value/evidence agreement: a source quote can be genuine but interpreted backwards, such as page-number-only permission treated as prohibition.
 * Flag only clear contradictions, preferring missed detections; return a reason for disagreement or an empty string otherwise.
 */
function valueIssue(fieldPath, type, value, evidence) {
  const text = String(evidence || '');
  const negative = NEGATION.test(text);
  const permissive = PERMISSION.test(text.replace(new RegExp(NEGATION.source, 'g'), ''));
  const mention = (forms, label) => (forms.some((form) => text.includes(form)) ? '' : `依据里没有提到"${label}"`);
  switch (type) {
    case 'allow':
      if (value === false && !negative) return '依据里没有"不得""禁止"等字样，与"不允许"不一致';
      return value === true && negative && !permissive ? '依据是禁止性表述，与"允许"不一致' : '';
    case 'forbid':
      if (value === true && !negative && !/只|仅|黑白|灰度/.test(text)) return '依据里没有"不得""禁止"等字样，与"不允许"不一致';
      return value === false && negative && !permissive ? '依据是禁止性表述，与"允许"不一致' : '';
    case 'pageNumber':
      if (value === 'footer_only') return /只|仅/.test(text) ? '' : '依据里没有"只""仅"等字样，与"页脚只准出现页码"不一致';
      if (value === 'forbid') return negative || /不编/.test(text) ? '' : '依据里没有"不得""不编"等字样，与"不得有页码"不一致';
      return negative && !/只|仅/.test(text) ? '依据是禁止性表述，与"页码不限"不一致' : '';
    case 'toc':
      if (value === 'forbid') return negative ? '' : '依据里没有"不得""不设"等字样，与"不得有目录"不一致';
      return /须|应|必须|编制|设置/.test(text) ? '' : '依据里没有"须""应"等字样，与"必须有目录"不一致';
    case 'numbering':
      return /阿拉伯|1\.1/.test(text) ? '' : '依据里没有"阿拉伯数字"或"1.1"等写法，与"阿拉伯数字分级编号"不一致';
    case 'size': {
      const names = Object.entries(CHINESE_SIZES).filter(([, pt]) => pt === value).map(([name]) => name);
      return mention([...names, ...numberForms(value)], names[0] || `${value}磅`);
    }
    case 'margin':
      return mention([...numberForms(value), ...numberForms(Math.round(value * 10))], `${value}厘米`);
    case 'linePt':
    case 'lineMultiple':
    case 'indent':
    case 'spacing':
      return mention(numberForms(value), String(value));
    case 'lineRule':
      return mention({ exact: ['固定'], atLeast: ['最小'], multiple: ['倍'] }[value] || [], { exact: '固定值', atLeast: '最小值', multiple: '倍' }[value] || value);
    case 'alignment':
      return mention({ both: ['两端'], left: ['左'], center: ['居中', '中间'], right: ['右'] }[value] || [], { both: '两端对齐', left: '左对齐', center: '居中', right: '右对齐' }[value] || value);
    case 'font':
      return normalizeForMatch(text).includes(normalizeForMatch(value)) ? '' : `依据里没有提到"${value}"`;
    case 'boolean':
      if (!fieldPath.endsWith('.bold')) return '';
      if (value === false) return negative || /不加粗|不加黑/.test(text) ? '' : '依据里没有"不加粗""不得"等字样，与"不加粗"不一致';
      return /加粗|加黑|粗体/.test(text) && !/不加粗|不得加粗|不加黑/.test(text) ? '' : '依据里没有"加粗"，与"加粗"不一致';
    default:
      return '';
  }
}

/**
 * Associate manual-review clauses with checks by keyword so the UI can display their current settings.
 * Users can then directly see conflicts, such as a page-number-only footer requirement with page numbers forbidden.
 */
const MANUAL_TOPICS = [
  [/页码/, ['structure.page_number']],
  [/页眉/, ['structure.forbid_header_content']],
  [/页脚/, ['structure.forbid_footer_content', 'structure.page_number']],
  [/加粗|加黑|粗体/, ['body.allow_bold']],
  [/倾斜|斜体/, ['body.allow_italic']],
  [/下划线/, ['body.allow_underline']],
  [/彩色|颜色|黑白|灰度/, ['body.allow_color', 'image.check_color']],
  [/底纹|突出显示|高亮/, ['body.allow_highlight']],
  [/空行|空白行/, ['structure.check_empty_paragraphs']],
  [/行距|行间距/, ['body.line_rule', 'body.line_pt']],
  [/目录/, ['structure.check_toc_present']],
  [/纸张|A4|A3/i, ['page.paper']],
  [/页边距/, ['page.margin_top_cm', 'page.margin_bottom_cm', 'page.margin_left_cm', 'page.margin_right_cm']],
  [/标题序号|标题编号|阿拉伯数字编排/, ['structure.heading_numbering']],
];

function linkManualItems(manual) {
  return manual.map((item) => [...new Set(MANUAL_TOPICS.filter(([pattern]) => pattern.test(item)).flatMap(([, paths]) => paths))]);
}

/**
 * Find source requirements with no extracted setting (likely AI omissions) by sentence-level keywords in excerpts sent to AI.
 * List the original sentence only when no corresponding field or manual-review clause was extracted; exclude wording immediately stating no requirement or restriction.
 */
const OMISSION_TOPICS = [
  ['字符底纹', /底纹|突出显示|高亮/, ['body.allow_highlight']],
  ['下划线', /下划线/, ['body.allow_underline']],
  ['倾斜', /倾斜|斜体/, ['body.allow_italic']],
  ['加粗', /加粗|加黑/, ['body.allow_bold']],
  ['彩色', /彩色|黑白|灰度/, ['body.allow_color', 'image.check_color']],
  ['页眉', /页眉/, ['structure.forbid_header_content']],
  ['页脚', /页脚/, ['structure.forbid_footer_content', 'structure.page_number']],
  ['页码', /页码/, ['structure.page_number']],
  ['空行', /空行|空白行/, ['structure.check_empty_paragraphs']],
  ['目录', /目录/, ['structure.check_toc_present']],
  ['行距', /行距|行间距/, ['body.line_rule', 'body.line_pt', 'body.line_multiple']],
  ['页边距', /页边距/, ['page.margin_top_cm', 'page.margin_bottom_cm', 'page.margin_left_cm', 'page.margin_right_cm']],
  ['首行缩进', /首行缩进/, ['body.first_line_indent_chars']],
  ['段前段后', /段前|段后/, ['body.space_before_pt', 'body.space_after_pt']],
  ['纸张', /纸张|A4|A3/i, ['page.paper']],
  ['对齐方式', /两端对齐|左对齐|右对齐/, ['body.alignment']],
  ['标题序号', /标题序号|标题编号|阿拉伯数字编排/, ['structure.heading_numbering']],
];
const MAX_OMISSIONS = 10;

function findOmissions(excerptText, extraction) {
  const sentences = String(excerptText || '').split(/[。；;\n]/).map((item) => item.trim()).filter(Boolean);
  const manualText = extraction.manual.join('\n');
  const omissions = [];
  for (const [topic, pattern, fields] of OMISSION_TOPICS) {
    if (fields.some((fieldPath) => extraction.fields[fieldPath]) || pattern.test(manualText)) continue;
    const exempt = new RegExp(`(${pattern.source})[^，,。；]{0,6}(不作要求|不做要求|不限|自定)`);
    const sentence = sentences.find((item) => pattern.test(item) && !exempt.test(item));
    if (sentence) omissions.push({ topic, sentence: sentence.slice(0, 120), fields });
    if (omissions.length >= MAX_OMISSIONS) break;
  }
  return omissions;
}

/**
 * Normalize AI results: accept only listed field paths, convert each type, and verify evidence.
 * Record conversion failures in dropped; retain missing or contradictory evidence as unverified, explaining contradictions.
 */
function normalizeExtraction(parsed, tenderMarkdown) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const rawFields = source.fields && typeof source.fields === 'object' ? source.fields : {};
  const normalizedTender = normalizeForMatch(tenderMarkdown);
  const fields = {};
  const dropped = [];
  for (const [fieldPath, item] of Object.entries(rawFields)) {
    const type = FIELD_TYPES[fieldPath];
    const raw = item && typeof item === 'object' && !Array.isArray(item) ? item.value : item;
    const evidence = item && typeof item === 'object' ? String(item.evidence || '').trim().slice(0, 120) : '';
    if (!type) {
      dropped.push(`${fieldPath}：不是可检查的格式项`);
      continue;
    }
    const value = coerceValue(type, raw);
    if (value === undefined) {
      if (raw !== null && raw !== undefined && raw !== '') dropped.push(`${fieldPath}：无法识别「${String(raw).slice(0, 30)}」`);
      continue;
    }
    const found = Boolean(evidence) && verifyEvidence(evidence, normalizedTender);
    const issue = found ? valueIssue(fieldPath, type, value, evidence) : '';
    fields[fieldPath] = { value, evidence, verified: found && !issue, ...(issue ? { issue } : {}) };
  }

  // Infer a missing line-spacing type from its value: multipliers use multiple spacing, point values use fixed spacing.
  if (!fields['body.line_rule']) {
    if (fields['body.line_multiple']) fields['body.line_rule'] = { ...fields['body.line_multiple'], value: 'multiple' };
    else if (fields['body.line_pt']) fields['body.line_rule'] = { ...fields['body.line_pt'], value: 'exact' };
  }

  const manual = (Array.isArray(source.manual) ? source.manual : [])
    .map((item) => String(item || '').trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 20);
  return {
    fields,
    dropped,
    manual,
    manualFields: linkManualItems(manual),
    notes: typeof source.notes === 'string' ? source.notes.trim().slice(0, 300) : '',
  };
}

function setPath(target, fieldPath, value) {
  const parts = fieldPath.split('.');
  let cursor = target;
  for (const key of parts.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = value;
}

/**
 * Build a preset from the default profile: first disable formatting checks, then fill extracted values.
 * Keep identity and structural-trace checks enabled by default; return the profile and fields unspecified by the tender.
 */
function buildExtractedProfile(extraction) {
  const profile = normalizeProfile({});
  for (const fieldPath of CLEARED_WHEN_MISSING) setPath(profile, fieldPath, null);
  for (const [fieldPath, item] of Object.entries(extraction.fields)) setPath(profile, fieldPath, item.value);
  // Use only the value matching the spacing type: fixed spacing needs no multiplier, and multiple spacing needs no points.
  const lineRule = extraction.fields['body.line_rule']?.value;
  const notApplicable = lineRule === 'multiple' ? 'body.line_pt' : lineRule ? 'body.line_multiple' : '';
  return {
    profile: normalizeProfile(profile),
    unspecified: CLEARED_WHEN_MISSING.filter((fieldPath) => !extraction.fields[fieldPath] && fieldPath !== notApplicable),
  };
}

module.exports = {
  EXTRACTABLE_FIELDS,
  buildExtractedProfile,
  buildExtractionMessages,
  findOmissions,
  locateFormatExcerpts,
  normalizeExtraction,
  normalizeForMatch,
  verifyEvidence,
};
