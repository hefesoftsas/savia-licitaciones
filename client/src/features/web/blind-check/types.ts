export type BlindCheckStep = 'upload' | 'preset' | 'results' | 'fix';

export type BlindCheckPresetTab = 'page' | 'body' | 'headings' | 'table' | 'privacy' | 'source';

/** Issue categories; other holds issues outside the preceding categories, such as tender clauses needing manual review. */
export type BlindCheckCategory = 'privacy' | 'structure' | 'page' | 'paragraph' | 'font' | 'text' | 'table' | 'consistency' | 'image' | 'other';

/** Results filter: all issues or a category. */
export type BlindCheckResultTab = 'all' | BlindCheckCategory;

export type BlindCheckSeverity = 'high' | 'medium' | 'low';

export type BlindCheckResultStatus = 'idle' | 'running' | 'success' | 'error';

export type BlindCheckLineRule = 'exact' | 'atLeast' | 'multiple';

export type BlindCheckAlignment = 'left' | 'center' | 'right' | 'both';

export type BlindCheckTocMode = 'ignore' | 'hint' | 'forbid' | 'require';
/** Page numbers: forbid prohibits them; footer_only allows only page numbers in the footer; null imposes no restriction. */
export type BlindCheckPageNumberMode = 'forbid' | 'footer_only' | null;

export interface BlindCheckHeadingTarget {
  font_cn: string | null;
  size_pt: number | null;
  bold: boolean | null;
}

/**
 * Formatting preset follows the check engine profile structure. null disables a check when the tender has no
 * requirement; table bold null inherits body formatting.
 */
export interface BlindCheckProfile {
  page: {
    paper: 'A4' | 'A3' | 'Letter' | null;
    margin_top_cm: number | null;
    margin_bottom_cm: number | null;
    margin_left_cm: number | null;
    margin_right_cm: number | null;
    check_orientation: boolean;
    forbid_columns: boolean;
    check_sections: boolean;
  };
  body: {
    font_cn: string | null;
    font_en: string | null;
    size_pt: number | null;
    line_rule: BlindCheckLineRule;
    line_pt: number | null;
    line_multiple: number | null;
    space_before_pt: number | null;
    space_after_pt: number | null;
    first_line_indent_chars: number | null;
    alignment: BlindCheckAlignment | null;
    allow_bold: boolean | null;
    allow_italic: boolean | null;
    allow_underline: boolean | null;
    allow_color: boolean | null;
    allow_highlight: boolean | null;
    allow_char_spacing: boolean;
    allow_font_scaling: boolean;
    check_latin_size: boolean;
    tolerance_pt: number;
    tolerance_line_pt: number;
    tolerance_indent_chars: number;
    tolerance_margin_cm: number;
    check_snap_to_grid: boolean;
    check_vert_align: boolean;
  };
  headings: Record<'1' | '2' | '3' | '4', BlindCheckHeadingTarget>;
  table: {
    check_font: boolean;
    font_cn: string | null;
    check_size: boolean;
    size_pt: number | null;
    check_first_line_indent: boolean;
    first_line_indent_chars: number | null;
    /** null inherits body formatting. */
    allow_bold: boolean | null;
    check_tblStyle: boolean;
    check_shading: boolean;
    check_nested: boolean;
    alignment: 'left' | 'center' | 'right' | null;
    check_merge: boolean;
  };
  structure: {
    check_empty_paragraphs: boolean | null;
    check_revisions: boolean;
    check_comments: boolean;
    check_hidden_text: boolean;
    check_header_footer: boolean;
    forbid_header_content: boolean | null;
    forbid_footer_content: boolean | null;
    page_number: BlindCheckPageNumberMode;
    /** Heading numbering: arabic uses decimal hierarchy (1, 1.1, 1.1.1); null disables the check. */
    heading_numbering: 'arabic' | null;
    check_toc_present: BlindCheckTocMode;
    check_textbox: boolean;
    check_hyperlink: boolean;
    check_field_codes: boolean;
    check_bookmarks: boolean;
    skip_cover: boolean;
  };
  text: {
    check_english_punct: boolean;
    check_spaces: boolean;
    space_rules: {
      strip_leading_trailing: boolean;
      remove_between_cjk: boolean;
      forbid_fullwidth_space: boolean;
    };
    check_tabs: boolean;
    check_manual_linebreak: boolean;
    check_irregular: boolean;
    check_halfwidth_brackets: boolean;
    check_fullwidth_digits: boolean;
    check_fullwidth_letters: boolean;
  };
  privacy: {
    enable_builtin: boolean;
    keywords: string[];
    regex: string[];
    whitelist: string[];
    ignore_orgs: string[];
    check_company_suffix: boolean;
    check_phone: boolean;
    check_id_card: boolean;
    check_email: boolean;
    check_url: boolean;
    check_credit_code: boolean;
    check_bank_account: boolean;
    check_placeholder: boolean;
    check_toc: boolean;
  };
  props: {
    check_author: boolean;
    check_last_modified_by: boolean;
    check_company: boolean;
    check_template: boolean;
    check_custom_props: boolean;
  };
  consistency: {
    check_heading_format: boolean;
    check_heading_numbering: boolean;
    check_heading_level_jump: boolean;
    check_heading_content: boolean;
    heading_max_chars: number;
    check_body_format: boolean;
    check_mixed_fonts: boolean;
  };
  image: {
    check_color: boolean;
    check_vector: boolean;
    check_metadata: boolean;
  };
  rules: Record<string, { enabled?: boolean; severity?: BlindCheckSeverity }>;
}

/** AI-extracted field: value, tender source evidence, verification status (evidence exists and agrees with the value), and reason for any mismatch. */
export interface BlindCheckExtractedField {
  value: string | number | boolean | null;
  evidence: string;
  verified: boolean;
  issue?: string;
}

/** Suspected omitted requirement: topic, original tender sentence, and configurable field paths. */
export interface BlindCheckOmission {
  topic: string;
  sentence: string;
  fields: string[];
}

/** Source information recorded for an AI-generated tender preset. */
export interface BlindCheckPresetSource {
  version: number;
  tenderName: string;
  extractedAt: string;
  fields: Record<string, BlindCheckExtractedField>;
  unspecified: string[];
  manual: string[];
  /** One-to-one with manual: related check paths for each manual-review clause. */
  manualFields?: string[][];
  /** Requirements present in the source but absent from extracted settings, usually AI omissions. */
  omissions?: BlindCheckOmission[];
  dropped: string[];
  notes: string;
}

export interface BlindCheckPreset {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  profile: BlindCheckProfile;
  source?: BlindCheckPresetSource;
}

export interface BlindCheckTenderSources {
  technicalPlan: {
    available: boolean;
    fileName: string;
  };
}

export interface BlindCheckFile {
  id: string;
  fileName: string;
  size: number;
  modifiedAt: string;
  importedAt: string;
}

export interface BlindCheckSample {
  where: string;
  text: string;
  detail: string;
  origin: string;
  hint: string;
}

/** Location entry with paragraph number, used for per-occurrence AI review conclusions on candidate issues. */
export interface BlindCheckFindingItem {
  where: string;
  text: string;
  detail: string;
  locator: string;
}

export interface BlindCheckFindingGroup {
  id?: string;
  ruleId: string;
  ruleTitle: string;
  category: BlindCheckCategory;
  severity: BlindCheckSeverity;
  message: string;
  /** Candidate issue: the rule only screens; AI review decides whether it actually violates requirements. */
  candidate?: boolean;
  count: number;
  samples: BlindCheckSample[];
  items?: BlindCheckFindingItem[];
}

export type BlindCheckClauseStatus = 'pass' | 'fail' | 'unknown';

/** Tender-clause comparison: anonymous technical-bid requirement, source evidence, compliance, and related issue IDs. */
export interface BlindCheckClause {
  id: string;
  requirement: string;
  basis: string;
  status: BlindCheckClauseStatus;
  explanation: string;
  issues: string[];
  /** Evidence could not be verified in the tender source or preset sources. */
  basisUnverified?: boolean;
}

export type BlindCheckVerdict = 'problem' | 'not_problem' | 'uncertain';

export interface BlindCheckAiIssue {
  id: string;
  title: string;
  severity: BlindCheckSeverity;
  category: BlindCheckCategory;
  basis: string;
  detail: string;
  suggestion: string;
  /**
   * image_part identifies whether an image excerpt describes its name/alternative text (alt) or visual content
   * (content); unverified means the excerpt was not found in the specified paragraph. Empty locations indicate
   * a document-wide issue.
   */
  locations: Array<{ target: string; text: string; image_part?: 'alt' | 'content'; unverified?: boolean }>;
  /** Evidence could not be verified in the tender source or preset sources. */
  basisUnverified?: boolean;
}

export interface BlindCheckReview {
  summary: string;
  clauses: BlindCheckClause[];
  /** Candidate conclusions keyed by group ID (whole group) or group ID#entry index (individual entry). */
  verdicts: Record<string, { verdict: BlindCheckVerdict; reason: string }>;
  issues: BlindCheckAiIssue[];
  hasTender: boolean;
  tenderName: string;
}

export type BlindCheckReviewStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';

export interface BlindCheckReviewState {
  status: BlindCheckReviewStatus;
  inputSignature?: string;
  tenderName?: string;
  review?: BlindCheckReview | null;
  error?: string | null;
  updatedAt?: string;
}

/** One occurrence: location, source excerpt, and notes such as extra details, formatting source, or review rationale. */
export interface BlindCheckOccurrence {
  where: string;
  text: string;
  notes: string[];
}

/**
 * Final issue entry produced by Main's buildIssueList: reviewed conclusions are authoritative and counts
 * represent occurrences. kind distinguishes program rules, AI additions, and manual-review clauses only for
 * internal reconciliation; the UI does not distinguish sources.
 */
export interface BlindCheckIssue {
  id: string;
  kind: 'rule' | 'ai' | 'clause';
  ruleId: string;
  category: BlindCheckCategory;
  severity: BlindCheckSeverity;
  message: string;
  count: number;
  /** Contains locations requiring confirmation, or is itself a clause requiring manual review. */
  uncertain: boolean;
  requirements: Array<{ text: string; unverified: boolean }>;
  explanation: string;
  hint: string;
  occurrences: BlindCheckOccurrence[];
  /** Number of occurrences not listed individually. */
  more: number;
}

export interface BlindCheckFixEdit {
  issue: string;
  op: 'replace' | 'delete_paragraph' | 'clear_image_alt';
  target: string;
  before: string;
  after: string;
}

/** Repair-result row for an issue in scope or a newly introduced issue. Post-repair rechecking determines the outcome; count = fixed + pending. */
export interface BlindCheckFixItem {
  id: string;
  category: BlindCheckCategory;
  severity: BlindCheckSeverity;
  message: string;
  count: number;
  fixed: number;
  pending: number;
  isNew: boolean;
  reason: string;
  suggestion: string;
  pendingOccurrences: BlindCheckOccurrence[];
  edits: BlindCheckFixEdit[];
}

export interface BlindCheckFixAgent {
  status: 'success' | 'error' | 'skipped';
  reason?: string;
  error?: string;
  summary?: string;
  edits?: BlindCheckFixEdit[];
}

export interface BlindCheckSummary {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface BlindCheckStats {
  paragraphs: number;
  bodyParagraphs: number;
  tableParagraphs: number;
  tables: number;
  sections: number;
  tocEntries: number;
  headings: number;
  headingSources: Record<string, number>;
  coverParagraphs: number;
  images: number;
  imageFormats: Record<string, number>;
  vectorImages: number;
  rulesChecked: number;
  durationMs: number;
}

export interface BlindCheckResultState {
  status: BlindCheckResultStatus;
  inputSignature?: string;
  presetName?: string;
  summary?: BlindCheckSummary | null;
  stats?: BlindCheckStats | null;
  ruleErrors?: string[];
  error?: string | null;
  updatedAt?: string;
  groups: BlindCheckFindingGroup[];
}

export interface BlindCheckFixValidation {
  checked: boolean;
  skippedReason: string;
  originalErrors: number;
  fixedErrors: number;
}

/** Automatic repair results: the repaired copy stays in the workspace and the source is unchanged; groups contains remaining issues after rechecking. */
export interface BlindCheckFixResultState {
  status: BlindCheckResultStatus;
  inputSignature?: string;
  fixRules?: string[];
  outputPath?: string;
  sourceBytes?: number;
  outputBytes?: number;
  fixes?: Record<string, number>;
  notes?: string[];
  validation?: BlindCheckFixValidation;
  /** Occurrences within repair scope. */
  beforeSummary?: BlindCheckSummary | null;
  /** Occurrences pending manual handling, including newly introduced issues. */
  afterSummary?: BlindCheckSummary | null;
  afterStats?: BlindCheckStats | null;
  error?: string | null;
  updatedAt?: string;
  groups: BlindCheckFindingGroup[];
  /** Per-issue repair conclusions within scope, plus newly introduced issues. */
  items?: BlindCheckFixItem[];
  agent?: BlindCheckFixAgent | null;
}

export interface BlindCheckTaskState {
  task_id: string;
  type: string;
  status: 'running' | 'success' | 'error';
  progress: number;
  logs: string[];
  started_at: string;
  updated_at: string;
  error?: string;
  stats?: { presetId?: string; presetName?: string; fieldCount?: number; unverified?: number; omissions?: number; fewFields?: boolean };
}

export interface BlindCheckWorkspaceState {
  step: BlindCheckStep;
  presetId: string;
  presetTab: BlindCheckPresetTab;
  resultTab: BlindCheckResultTab;
  useCredentialWords: boolean;
  /** Whether the previous check included AI review; used as the check dialog default. */
  aiReviewEnabled: boolean;
  /** Whether the previous repair included AI repair; used as the repair dialog default. */
  fixAiEnabled: boolean;
  file: BlindCheckFile | null;
  result: BlindCheckResultState;
  review: BlindCheckReviewState;
  /** Final issues exist only after a successful check while review is not running; otherwise empty. */
  issues: BlindCheckIssue[];
  checkTask?: BlindCheckTaskState;
  fixRules: string[];
  fixResult: BlindCheckFixResultState;
  fixTask?: BlindCheckTaskState;
  extractionTask?: BlindCheckTaskState;
}

export type BlindCheckWorkspacePatch = Partial<BlindCheckWorkspaceState>;

export interface BlindCheckCredentialWord {
  label: string;
  value: string;
}
