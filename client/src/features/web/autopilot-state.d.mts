export type ProjectUiMode = 'autopilot' | 'detailed';

export type AutopilotMilestoneId = 'reading' | 'structure' | 'facts' | 'draft';

export type AutopilotMilestoneStatus = 'pending' | 'active' | 'paused' | 'blocked' | 'completed';

export interface AutopilotActiveJob {
  id: string;
  kind: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted' | string;
  progress?: 'preparing' | 'reading' | 'ocr' | 'generating' | string | null;
}

export interface AutopilotPreparation {
  status: 'running' | 'paused' | 'blocked' | 'ready';
  stage: string;
  reason: string | null;
  runId: string;
  wordId: string | null;
  economicId?: string;
  activeJob?: AutopilotActiveJob | null;
}

export interface AutopilotTimelineStep {
  id: AutopilotMilestoneId;
  index: number;
  stepNumber: number;
  label: string;
  status: AutopilotMilestoneStatus;
}

export interface AutopilotQuestion {
  id: string;
  jobId: string;
  question: string;
  options: { label: string; description?: string; custom: boolean }[];
}

export type AutopilotDecision =
  | { kind: 'agent_question'; reason: 'agent_question'; questions: AutopilotQuestion[] }
  | { kind: 'technical_score_unknown'; reason: string }
  | { kind: 'facts_need_input'; reason: string }
  | { kind: 'rup_consent_required'; reason: string }
  | { kind: 'existing_draft'; reason: string }
  | { kind: 'bid_document_rules_incomplete'; reason: string }
  | { kind: 'word_page_limit_exceeded'; reason: string }
  | { kind: 'task_failed'; reason: string }
  | { kind: 'generic_blocked'; reason: string };

export interface FactGroup {
  id: string;
  title: string;
  content: string;
}

export interface PendingFactGroup extends FactGroup {
  pendingCount: number;
}

export type RunnerConnectionState = 'unknown' | 'offline' | 'online' | 'busy';

export interface RunnerInfo {
  id?: string;
  name?: string | null;
  lastSeenAt: string | null;
  executionMode?: string;
  runningJobs?: number;
}

export interface RunnerConnectionSummary {
  state: RunnerConnectionState;
  onlineCount: number;
  totalCount: number;
  runnerName: string | null;
  runningJobs: number;
}

export interface JobActivityEvent {
  sequence: number;
  code: string;
  at: string;
  details?: {
    text?: string;
    event?: string;
    tool?: string;
    part?: number;
    totalParts?: number;
    document?: string;
    chapter?: string;
    path?: string;
    page?: number;
    totalPages?: number;
    index?: number;
    total?: number;
  };
}

export const PROJECT_UI_MODE_KEY: 'savia_project_ui_mode';
export const BACKEND_STAGES: readonly string[];
export const RUNNER_ONLINE_WINDOW_MS: number;

export function stageToMilestoneIndex(stage: string | null | undefined): number;
export function getStageLabel(stage: string | null | undefined, language?: 'es' | 'en'): string;
export function summarizeRunnerConnection(
  runners: readonly RunnerInfo[] | null | undefined,
  serverNow: number,
): RunnerConnectionSummary;
export function getActiveJobStatusLabel(
  activeJob: AutopilotActiveJob | null | undefined,
  language?: 'es' | 'en',
  runnerState?: RunnerConnectionState,
): string;
export function formatActivityEventLabel(
  event: JobActivityEvent | null | undefined,
  language?: 'es' | 'en',
): string;
export function buildAutopilotTimeline(
  preparation: AutopilotPreparation | null | undefined,
  language?: 'es' | 'en',
): AutopilotTimelineStep[];
export function resolveAutopilotDecision(
  preparation: AutopilotPreparation | null | undefined,
  questions?: AutopilotQuestion[],
): AutopilotDecision | null;
export function resolveAutopilotViewPhase(
  preparation: AutopilotPreparation | null | undefined,
  questions?: AutopilotQuestion[],
): 'setup' | 'running' | 'paused' | 'decision' | 'ready';
export function extractPendingFactGroups(groups: readonly FactGroup[] | null | undefined): PendingFactGroup[];
export function countPendingFacts(groups: readonly FactGroup[] | null | undefined): number;
export function mergeUpdatedFactGroups(
  allGroups: readonly FactGroup[],
  updatedPendingGroups: readonly FactGroup[],
): FactGroup[];
export interface AutopilotProgress {
  percent: number;
  stageNumber: number;
  completedStages: number;
  totalStages: number;
  state: 'idle' | 'running' | 'paused' | 'blocked' | 'ready';
}

export interface BlockedReasonCopy {
  title: string;
  description: string;
  actionLabel: string;
}

export function readProjectUiMode(storage?: Pick<Storage, 'getItem'> | null): ProjectUiMode;
export function writeProjectUiMode(storage: Pick<Storage, 'setItem'> | null | undefined, mode: ProjectUiMode): void;
export function computeAutopilotProgress(preparation: AutopilotPreparation | null | undefined): AutopilotProgress;
export function extractPendingPlaceholdersForGroup(group: FactGroup | null | undefined): string[];
export function describeBlockedReason(
  reason: string | null | undefined,
  stage: string | null | undefined,
  language?: 'es' | 'en',
): BlockedReasonCopy;
