export interface CompanyWorkspaceState {currentId:string;activeId:string;companies:Array<{id:string;name:string}>}
export interface OfficialFormSuggestion {value:string;source:string;page?:number;label?:string;sourceId?:string;sourceName?:string;quote?:string}
export interface RequirementSuggestion { id:string;title:string;category:'general'|'legal'|'financial'|'technical'|'experience';sourceId:string;quote:string;factIds:string[];certificateIds:string[];reviewRequired:true }
export interface RequirementSuggestionRun { id:string;status:'running'|'completed'|'error'|'interrupted';sources:{documents:Array<{id:string;name:string}>;facts:Array<{id:string;label:string;value:string;page:number}>;certificates:Array<{id:string;name:string;validityMode:string;validTo:string}>};result:{requirements:RequirementSuggestion[];discardedCount:number;discardedLinks:number;unreadableSources:Array<{id:string;name:string}>}|null;error:string;createdAt:string;stale:boolean;accepted:Array<{suggestionId:string;requirementId:string;runId:string}> }
export interface PaaHeader { planId:string;entity:string;year:number|null;version:string;modifiedAt:string;status:string;headerId:string }
export interface PaaWatchState { items:Array<PaaHeader & {checkedAt:string;error:string}>;alerts:Array<{id:string;planId:string;previous:PaaHeader;current:PaaHeader;createdAt:string;reviewed:boolean}>;unreadCount:number;running:boolean }
export interface EconomicOfferItem {id:string;name:string;quantity:string;cost:string;price:string;rate:string;discount?:string}
export interface EconomicOfferDraft {currency:string;budget:string;items:EconomicOfferItem[]}
export interface EconomicOfferCalculation {items:Array<{id:string;gross:string;discount:string;net:string;tax:string;total:string;cost:string|null}>;gross:string;discount:string;net:string;tax:string;total:string;cost:string|null;margin:string|null;budgetDifference:string|null}
export interface EconomicOfferSaved {draft:EconomicOfferDraft;calculation:EconomicOfferCalculation|null;error:string;updatedAt:string}
export interface RequirementSuggestionState {processId:string;documentCount:number;factCount:number;certificateCount:number;runningId:string|null;runs:RequirementSuggestionRun[]}

export interface AddendumImpactFinding { id:string; title:string; category:'deadline'|'requirement'|'financial'|'technical'|'document'|'other'; addendumQuote:string; originalSourceId:string|null; originalQuote:string; offerSourceId:string|null; offerQuote:string; explanation:string; unquotedTitleNumbers:string[]; shortQuoteSources:Array<'addendum'|'reference'|'offer'>; reviewRequired:true }
export interface AddendumImpactRun { id:string; status:'running'|'completed'|'error'|'interrupted'; sources:{ addendumId:string;addendumName:string;originals:Array<{id:string;name:string}>;offers:Array<{id:string;name:string}> }; result:{impacts:AddendumImpactFinding[];discardedCount:number;unreadableSources:Array<{id:string;name:string}>;reviewRequired:true}|null;error:string;createdAt:string;stale:boolean;reviews:Array<{impactId:string;status:'pending'|'reviewed';note:string;updatedAt:string}> }
export interface AddendumImpactState { processId:string;documents:Array<{id:string;name:string;readable:boolean}>;offerCount:number;runs:AddendumImpactRun[];runningId:string|null }

export interface SecopAgendaItem { id:string; kind:'task'|'deadline'|'certificate'; title:string; date:string; processId?:string; processTitle?:string; deadlineSource?:'watch'|'saved'; deadlineVerified?:boolean; checkedAt?:string; watchError?:string }

export interface SecopWatchState {
  items: Array<{ id: string; processId: string; title: string; kind: 'status' | 'phase' | 'deadline' | 'value' | 'document'; previous: string | number | null; current: string | number | { id: string; name: string } | null; documentName?: string; createdAt: string; reviewed: boolean }>;
  checks: Array<{ processId: string; checkedAt: string; error: string }>;
  unreadCount: number;
  running: boolean;
}

export interface BidEvaluationSource { id: string; name: string; text: string }
export interface BidEvaluationCriterion { id: string; name: string; tenderSourceId: string; tenderQuote: string; maxPoints: number | null; maxPointsUnverified: boolean; bidSourceId: string | null; bidQuote: string; proposedPoints: number | null; explanation: string; reviewRequired: boolean }
export interface BidEvaluationReview { criterionId: string; status: 'accepted' | 'adjusted' | 'unresolved'; score: number | null; note: string; updatedAt: string }
export interface BidEvaluationRun { id: string; projectId: string; status: 'running' | 'completed' | 'error' | 'interrupted'; tenderSources: BidEvaluationSource[]; bidSources: BidEvaluationSource[]; result: { criteria: BidEvaluationCriterion[]; discardedCount: number; unreadableDocuments: string[]; total: null } | null; error: string | null; createdAt: string; updatedAt: string; reviews: BidEvaluationReview[] }
export interface BidEvaluationState { projectId: string; tenderSources: Array<{id: string; name: string}>; documents: Array<{id: string; name: string; readable: boolean; createdAt: string}>; runs: Array<{id: string; status: BidEvaluationRun['status']; createdAt: string; criteriaCount: number}>; runningId: string | null }
export interface TenderChatMessage { id: string; role: 'user' | 'assistant'; content: string; status: 'running' | 'complete' | 'error' | 'interrupted'; createdAt: string; followUps?: string[]; followUpSourceIds?: string[] }
export interface RupComparisonSnapshot { factId:string; certificateName:string; issuedOn:string; label:string; value:string; interpretedValue:string; page:number; title:string; source:string; operator:'gte'|'lte'; threshold:string; updatedAt:string; stale:boolean }

import type { AiHttpErrorPayload, ChatCompletionRequest, JsonCompletionRequest } from './ai';
import type { OfficialTransactionsPage, OfficialInvoiceApplicationInput, OfficialInvoiceInfo, OfficialAccountState, OfficialEmailCredentials, OfficialEmailPurpose, OfficialRechargeOption, OfficialRechargeOrder } from './officialAccount';
import type { DuplicateCheckWorkspacePatch, DuplicateCheckWorkspaceState, FileSelectionResult } from './bid';
import type { ClientConfig, ConfigSaveResult, ImageModelTestResult, ModelInfoResult, ModelListResult, UpdateChannel } from './config';
/* eslint-disable @typescript-eslint/no-explicit-any */
type KnowledgeAnalysisSnapshot = any; type KnowledgeBaseEvent = any; type KnowledgeBaseIndex = any; type KnowledgeBaseIndexMutationResult = any; type KnowledgeBaseMutationResult = any; type KnowledgeBaseSearchRequest = any; type KnowledgeBaseSearchPage = any; type KnowledgeBaseRetryDocumentResult = any; type KnowledgeBaseStartMatchingResult = any; type KnowledgeBaseUploadResult = any; type KnowledgeDocument = any; type KnowledgeFolder = any; type KnowledgeItem = any;
type RejectionCheckWorkspacePatch = any; type RejectionCheckWorkspaceState = any; type RejectionDocumentRole = any;
type BlindCheckCredentialWord = any; type BlindCheckPreset = any; type BlindCheckProfile = any; type BlindCheckTenderSources = any; type BlindCheckWorkspacePatch = any; type BlindCheckWorkspaceState = any;
type BidAnalysisMode = any; type BidAnalysisTaskState = any; type BidSectionMode = any; type ContentGenerationOptions = any; type ContentGenerationPlanState = any; type ContentGenerationProgressDetail = any; type ContentGenerationRuntimeState = any; type ContentGenerationSectionState = any; type DetectedBidSection = any; type GlobalFactGroupState = any; type SaveOutlineRequest = any; type SaveOutlineSelectionRequest = any; type TechnicalPlanGenerationConfig = any; type TechnicalPlanState = any; type TechnicalPlanStep = any;
type FeasibilityProjectInfo = any; type FeasibilityReportState = any; type FeasibilityReportStep = any; type FeasibilitySaveOutlineRequest = any; type FeasibilitySourceFile = any;
type CredentialCertificate = any; type CredentialEmployee = any; type CredentialImageFieldKey = any; type CredentialLibraryImportResult = any; type CredentialLibraryMutationResult = any; type CredentialLibraryProfile = any; type CredentialLibrarySnapshot = any; type CredentialOtherMaterial = any; type CredentialProject = any; type CredentialRecordSavePayload<T = any> = T;
import type { ExportFormatConfig, ExportTemplateRecord } from './exportFormat';
import type { TechnicalPlanOutlineData as OutlineData } from './outline';
import type { SecopBridge, SecopProcess, SecopDocument, SavedTenderSummary, SavedTenderDetail, TenderWorkStage, TenderWorkTask, TenderRequirement, TenderRequirementStatus, OpportunitySuggestionsState } from './secop';

/** Configuration saves update submitted fields only; text-provider profiles also support partial updates. */
export type ClientConfigPatch = Partial<Omit<ClientConfig, 'text_model_profiles'>> & {
  text_model_profiles?: {
    [Provider in keyof ClientConfig['text_model_profiles']]?: Partial<ClientConfig['text_model_profiles'][Provider]>;
  };
};

export interface TaskEventTask {
  task_id: string;
  type: string;
  status: string;
  progress: number;
  progress_detail?: ContentGenerationProgressDetail;
  logs: string[];
  started_at: string;
  updated_at: string;
  error?: string;
  stats?: unknown;
}

export interface TaskEvent<TState = unknown, TRejectionCheckState = unknown, TDuplicateCheckState = unknown> {
  task: TaskEventTask;
  technicalPlan?: TState;
  technicalPlanPatch?: Partial<TechnicalPlanState>;
  bidItem?: BidAnalysisTaskState;
  outlineData?: OutlineData | null;
  contentSection?: ContentGenerationSectionState;
  contentPlan?: { nodeId: string; value: ContentGenerationPlanState | null };
  contentRuntime?: ContentGenerationRuntimeState;
  rejectionCheck?: TRejectionCheckState;
  rejectionCheckPatch?: RejectionCheckWorkspacePatch;
  duplicateCheck?: TDuplicateCheckState;
  duplicateCheckPatch?: DuplicateCheckWorkspacePatch;
  blindCheck?: BlindCheckWorkspaceState;
  blindCheckPatch?: BlindCheckWorkspacePatch;
  feasibilityReportPatch?: Partial<FeasibilityReportState>;
}

export interface WordExportProgressEvent {
  requestId?: string;
  phase: 'running' | 'success' | 'error' | 'canceled';
  progress: number;
  message: string;
  warnings?: string[];
}

export interface WordExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  message?: string;
  warnings?: string[];
}

export interface CheckResultExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  message?: string;
}

export interface RequiredOnlineServiceStatus {
  id: string;
  label: string;
  domain: string;
  available: boolean;
  checked: boolean;
}

export interface RequiredOnlineServicesStatus {
  checked: boolean;
  services: RequiredOnlineServiceStatus[];
  unavailableServices: RequiredOnlineServiceStatus[];
}

export interface DeveloperTextTokenStats {
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  cache_ratio: number;
}

export interface DeveloperExpansionReplaceTestPayload {
  sectionId: string;
  sectionTitle: string;
  sectionDescription?: string;
  content: string;
  selectedText: string;
}

export interface DeveloperExpansionReplacePatch {
  operation: string;
  anchor?: string;
  target_text?: string;
  content: string;
}

export type DeveloperExpansionReplaceTestStatus = 'replace-success' | 'blocked';

export interface DeveloperExpansionReplaceTestDiagnostics {
  status: DeveloperExpansionReplaceTestStatus;
  matchStrategy: string;
  matchStart: number;
  matchEnd: number;
  matchedText: string;
  targetTextMatched: boolean;
  targetTextKey: string;
  candidateCount: number;
  contentOccurrencesBefore: number;
  contentOccurrencesAfter: number;
  charsBefore: number;
  charsAfter: number;
  deltaChars: number;
  error: string;
}

export interface DeveloperExpansionReplaceTestResult {
  success: boolean;
  status: DeveloperExpansionReplaceTestStatus;
  sectionId: string;
  sectionTitle: string;
  rawPatch: DeveloperExpansionReplacePatch;
  appliedPatch: DeveloperExpansionReplacePatch;
  diagnostics: DeveloperExpansionReplaceTestDiagnostics;
  applyError?: string;
  originalContent: string;
  selectedText: string;
  nextContent: string;
}

export interface LatestReleaseInfo {
  version: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  download_url?: string;
  channel?: UpdateChannel;
}

export interface UpdateCheckResult {
  enabled: boolean;
  updateAvailable: boolean;
  version?: string;
  downloaded?: boolean;
  failed?: boolean;
  message?: string;
  channel?: UpdateChannel;
}

export interface UpdateInstallResult {
  success: boolean;
  message?: string;
}

export interface PluginUpdateInfo {
  id: string;
  name: string;
  installedVersion: string;
  version: string;
}

export interface PluginUpdateResult extends PluginUpdateInfo {
  success: boolean;
  message?: string;
}

export interface PluginUpdateAllResult {
  updates: PluginUpdateInfo[];
  results: PluginUpdateResult[];
}

export interface GpuHardwareAccelerationStatus {
  configured: boolean;
  enabled: boolean;
  currentEnabled: boolean;
  trial: boolean;
  forcedDisabled: boolean;
}

export type WorkspaceDatabasePhase = 'checking' | 'repairing' | 'backing-up' | 'upgrading' | 'cleaning' | 'ready' | 'error';

export interface WorkspaceDatabaseStatus {
  phase: WorkspaceDatabasePhase;
  ready: boolean;
  message: string;
  updatedAt?: string;
  currentVersion?: number;
  targetVersion?: number;
  migrationVersion?: number;
  migrationDescription?: string;
}

export type StorageUsageGroupId = 'protected' | 'legacy' | 'temporary';
export type StorageCleanGroupId = Exclude<StorageUsageGroupId, 'protected'>;

export interface StorageUsageItem {
  id: string;
  label: string;
  description: string;
  bytes: number;
}

export interface StorageUsageGroup {
  id: StorageUsageGroupId;
  label: string;
  description: string;
  bytes: number;
  items: StorageUsageItem[];
}

export interface StorageUsage {
  groups: StorageUsageGroup[];
  totalBytes: number;
  scannedAt: string;
}

export interface StorageCleanResult {
  freedBytes: number;
  /** Items not deleted because they are in use or permission was denied. */
  failedCount: number;
  /** Cleanup categories skipped entirely because related tasks are running. */
  skipped: Array<{ label: string; reason: string }>;
  usage: StorageUsage;
}

export type AgentSelfCheckStepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped';
export type AgentSelfCheckStatus = 'normal' | 'error' | 'busy';

export type AgentRuntimePhase = 'stopped' | 'starting' | 'idle' | 'running' | 'aborting' | 'unhealthy' | 'restarting' | 'closing';

export interface AgentRuntimeActiveTask {
  task_id: string;
  session_id: string;
  title: string;
  stage: string;
  progress_text: string;
  started_at: string;
  last_activity_at: string;
  last_progress_at?: string;
  elapsed_seconds: number;
  idle_seconds: number;
  waiting_for_user?: boolean;
  workspace_dir?: string;
  is_primary?: boolean;
}

export interface AgentQuestionOption {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
  custom: boolean;
}

export interface AgentQuestion {
  question_id: string;
  task_id: string;
  session_id?: string;
  task_title: string;
  question: string;
  options: AgentQuestionOption[];
  asked_at: string;
  auto_answer_at?: string;
  is_primary?: boolean;
}

export interface AutoConfirmationState {
  enabled: boolean;
}

export interface AgentQuestionAnswerPayload {
  question_id: string;
  option_id: string;
  custom_answer?: string;
}

export interface AgentQuestionAnswerResult {
  success: boolean;
}

export type LicenseStatusValue = 'missing' | 'active' | 'expired' | 'invalid' | 'invalidated' | 'machine_mismatch' | 'refresh_failed' | 'debug_disabled';

export interface LicenseRuntimeStatus {
  status: LicenseStatusValue | string;
  plan: 'free' | 'personal_premium' | 'enterprise_premium' | string;
  expiresAt: string;
  licenseExpiresAt: string;
  licenseStatus: string;
  activationMode: 'online' | 'offline' | 'debug_disabled' | string;
  sourceTrusted: boolean;
  sourceTrustedText: string;
  untrustedReason: string;
  machineFingerprintHash: string;
  fingerprintVersion: string;
  buildTrusted: boolean;
  buildChanged: boolean;
  buildId: string;
  keyId: string;
  lastCheckedAt: string;
  refreshError?: string;
  config: {
    freeLicenseDays: number;
    expirePopupEnabled: boolean;
    expirePopupDismissible: boolean;
  };
}

export interface LicenseOfflineActivationResult {
  success: boolean;
  canceled?: boolean;
  message: string;
  status: LicenseRuntimeStatus;
}

export interface AgentRuntimeStatus {
  runtime_id: 'pi';
  runtime_name: string;
  phase: AgentRuntimePhase;
  healthy: boolean;
  message: string;
  updated_at: string;
  last_health_at?: string;
  last_health_error?: string;
  restart_pending?: boolean;
  restart_pending_reason?: string;
  active_tasks?: AgentRuntimeActiveTask[];
  primary_session_id?: string;
  queued_count?: number;
  queued_tasks?: Array<{
    task_id: string;
    title: string;
    queued_at: string;
    position: number;
  }>;
  proxy?: {
    active: number;
    queued: number;
    limit: number;
  };
  runtime_details?: Record<string, unknown>;
}

export interface AgentRunFile {
  path: string;
  content: string;
}

export interface AgentRunPayload {
  task_id?: string;
  title?: string;
  task?: string;
  prompt?: string;
  output_file?: string;
  files?: AgentRunFile[];
  timeout_ms?: number;
  max_retries?: number;
  /** Whether to generate an ending summary, enabled by default; false ends the phase immediately after the last successful tool batch. */
  summary_enabled?: boolean;
}

export interface AgentRetryAttempt {
  attempt: number;
  at: string;
  error: string;
  output_chars: number;
}

export interface AgentRunResult {
  success: boolean;
  runtime_id: 'pi';
  status?: 'busy' | string;
  skipped?: boolean;
  message?: string;
  task_id?: string;
  title?: string;
  workspace_dir?: string;
  runtime_workspace_dir?: string;
  runtime_root?: string;
  output_file?: string;
  output_content?: string;
  assistant_text?: string;
  diff?: unknown[];
  session_id?: string;
  retry_count?: number;
  model_retry_count?: number;
  retry_attempts?: AgentRetryAttempt[];
  validation_result?: unknown;
  active_tasks?: AgentRuntimeActiveTask[];
  diagnostics?: Record<string, unknown>;
}

export type AgentMonitorEventType =
  | 'session_start'
  | 'primary_session_changed'
  | 'task_start'
  | 'task_input'
  | 'task_output'
  | 'assistant_delta'
  | 'assistant_end'
  | 'tool_start'
  | 'tool_update'
  | 'tool_end'
  | 'agent_start'
  | 'agent_end'
  | 'agent_settled'
  | 'turn_start'
  | 'turn_end'
  | 'compaction_start'
  | 'compaction_end'
  | 'auto_retry_start'
  | 'auto_retry_end'
  | 'retry'
  | 'task_end'
  | 'task_error';

export interface AgentMonitorEvent {
  sequence: number;
  at: string;
  type: AgentMonitorEventType;
  task_id: string;
  session_id?: string;
  task_key?: string;
  is_primary?: boolean;
  title?: string;
  workspace_dir?: string;
  stage_index?: number;
  workflow_stage?: string;
  prompt?: string;
  output_file?: string;
  files?: AgentRunFile[];
  delta?: string;
  text?: string;
  tool_call_id?: string;
  tool_name?: string;
  args?: unknown;
  partial_result?: unknown;
  result?: unknown;
  is_error?: boolean;
  attempt?: number;
  maximum?: number;
  delay_ms?: number;
  success?: boolean;
  final_error?: string;
  message?: string;
  output_content?: string;
  assistant_text?: string;
  retry_count?: number;
  model_retry_count?: number;
}

export interface AgentMonitorSnapshot {
  events?: AgentMonitorEvent[];
  total_events?: number;
  journal_error?: string;
  attached_at: string;
  active_tasks: AgentRuntimeActiveTask[];
  primary_session_id?: string;
}

export interface AgentSelfCheckStep {
  id: string;
  label: string;
  status: AgentSelfCheckStepStatus;
  message?: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
}

export interface AgentDiagnosticSection {
  id: string;
  title: string;
  status: AgentSelfCheckStepStatus | 'warning';
  summary?: string;
  details?: Array<{
    label: string;
    value: string;
  }>;
  items?: Array<{
    id: string;
    label: string;
    status: AgentSelfCheckStepStatus | 'warning';
    message?: string;
    detail?: string;
  }>;
}

export interface AgentSelfCheckResult {
  report_version?: number;
  check_id?: string;
  success: boolean;
  repaired?: boolean;
  runtime_id: 'pi';
  runtime_name: string;
  status: AgentSelfCheckStatus;
  message: string;
  checked_at: string;
  duration_ms: number;
  log_dir: string;
  log_file: string;
  runtime_root: string;
  workspace_dir: string;
  output_file: string;
  output_path: string;
  output_content?: string;
  conclusion?: string;
  steps: AgentSelfCheckStep[];
  sections: AgentDiagnosticSection[];
  diagnostics?: Record<string, unknown>;
  error?: Record<string, unknown>;
  model_config?: Record<string, unknown>;
  model_check?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  loopback_check?: Record<string, unknown>;
  tool_check?: Record<string, unknown>;
  agent_check?: Record<string, unknown>;
  session_snapshot?: Record<string, unknown>;
  diagnosis?: Record<string, unknown>;
  repair?: Record<string, unknown>;
  detail_text: string;
  runtime_status?: AgentRuntimeStatus;
}

export interface AgentSelfCheckReportExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  message: string;
}

export interface DeveloperLayoutFigureRequest {
  id: string;
  generation: 'aiImage' | 'mermaid' | 'htmlImage';
  prompt: string;
  caption: string;
  /** Frame ratio supplied by layout budget; HTML images use it for canvas dimensions, others for centered cropping. */
  aspectWidth: number;
  aspectHeight: number;
}

export interface DeveloperLayoutFigureResult {
  id: string;
  generation: string;
  /** Relative path that can be written directly into data-sv-asset-ref. */
  assetRef: string;
  width: number;
  height: number;
  /** Mermaid returns code, HTML returns source, and AI images return a local file path. */
  source: string;
  elapsedMs: number;
}

export interface SaviaBridge {
  companyWorkspaces: {getState:()=>Promise<CompanyWorkspaceState>;create:(name:string)=>Promise<CompanyWorkspaceState>;rename:(id:string,name:string)=>Promise<CompanyWorkspaceState>;selectNext:(id:string)=>Promise<CompanyWorkspaceState>};
  imageLibrary: {
    list: () => Promise<Array<{ id: string; name: string; url: string; createdAt: string }>>;
    importImages: () => Promise<Array<{ id: string; name: string; url: string; createdAt: string }> | null>;
    remove: (id: string) => Promise<void>;
  };
  appName: string;
  platform: string;
  getVersion: () => Promise<string>;
  getGpuHardwareAccelerationStatus: () => Promise<GpuHardwareAccelerationStatus>;
  saveGpuHardwareAccelerationPreference: (enabled: boolean) => Promise<ConfigSaveResult & { enabled: boolean; configured: boolean; restartRequired: boolean }>;
  startGpuHardwareAccelerationTrial: () => Promise<{ success: boolean }>;
  relaunchWithGpuHardwareAccelerationDisabled: () => Promise<{ success: boolean }>;
  requiredOnlineServices: {
    getStatus: () => Promise<RequiredOnlineServicesStatus>;
  };
  getLatestVersion: () => Promise<LatestReleaseInfo>;
  getUpdateDownloadUrl: () => Promise<string>;
  openExternal: (url: string) => Promise<{ success: boolean; message?: string }>;
  checkUpdate: () => Promise<UpdateCheckResult>;
  startUpdate: () => Promise<UpdateCheckResult>;
  quitAndInstall: () => Promise<UpdateInstallResult>;
  onUpdateProgress: (callback: (event: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (event: { version: string }) => void) => () => void;
  onUpdateError: (callback: (event: { message: string }) => void) => () => void;
  onPluginUpdatesAvailable: (callback: (updates: PluginUpdateInfo[]) => void) => () => void;
  database: {
    getStatus: () => Promise<WorkspaceDatabaseStatus>;
    onStatus: (callback: (status: WorkspaceDatabaseStatus) => void) => () => void;
  };
  ui: {
    setCurrentView: (view: { section: string; step?: string | null }) => Promise<{ success: boolean }>;
    setWindowTitle: (title: string) => Promise<{ success: boolean }>;
  };
  config: {
    load: () => Promise<ClientConfig>;
    save: (config: ClientConfigPatch) => Promise<ConfigSaveResult>;
    listModels: (config?: ClientConfig) => Promise<ModelListResult>;
    getModelInfo: (modelName: string) => Promise<ModelInfoResult>;
    openConfigFolder: () => Promise<{ success: boolean; path: string }>;
  };
  libreOffice: {
    getStatus: () => Promise<{ available: boolean; message: string }>;
    openDocument: (input?: { bytes: Uint8Array; name?: string }) => Promise<{ canceled: boolean }>;
  };
  storage: {
    getUsage: () => Promise<StorageUsage>;
    clean: (groupId: StorageCleanGroupId) => Promise<StorageCleanResult>;
  };
  licenseOnline: {
    getStatus: () => Promise<{configured: boolean; status: string; expiresAt?: number; offline?: boolean}>;
    activate: (key: string) => Promise<{status: string; expiresAt?: number; retryAt?: number}>;
    refresh: () => Promise<{status: string; expiresAt?: number; retryAt?: number; offline?: boolean}>;
    deactivate: () => Promise<{status: string}>;
  };
  license: {
    getStatus: () => Promise<LicenseRuntimeStatus>;
    refresh: () => Promise<LicenseRuntimeStatus>;
    importOfflineFile: () => Promise<LicenseOfflineActivationResult>;
    activateOfflineCode: (code: string) => Promise<LicenseOfflineActivationResult>;
  };
  officialAccount: {
    redeemCode: (input: { code: string; requestNo: string }) => Promise<{ redeemedPoint: string }>;
    createInvoiceApplication: (input: OfficialInvoiceApplicationInput) => Promise<void>;
    getInvoiceInfo: () => Promise<OfficialInvoiceInfo>;
    saveInvoiceInfo: (input: OfficialInvoiceInfo) => Promise<void>;
    getState: () => Promise<OfficialAccountState>;
    refreshBalance: () => Promise<OfficialAccountState>;
    getRechargeOptions: () => Promise<OfficialRechargeOption[]>;
    createRechargeOrder: (input: { optionId: string }) => Promise<OfficialRechargeOrder>;
    getRechargeOrders: () => Promise<OfficialRechargeOrder[]>;
    getTransactions: (page: number) => Promise<OfficialTransactionsPage>;
    getRechargeOrder: (id: string) => Promise<OfficialRechargeOrder>;
    closeRechargeOrder: (id: string) => Promise<OfficialRechargeOrder>;
    onRechargeOrderChanged: (callback: (order: OfficialRechargeOrder) => void) => () => void;
    onStateChanged: (callback: (state: OfficialAccountState) => void) => () => void;
    sendEmailCode: (input: { email: string; purpose: OfficialEmailPurpose }) => Promise<boolean>;
    loginWithEmail: (input: OfficialEmailCredentials) => Promise<OfficialAccountState>;
    bindEmail: (input: OfficialEmailCredentials) => Promise<OfficialAccountState>;
  };
  ai: {
    chat: (request: ChatCompletionRequest) => Promise<string>;
    requestJson: <TResult = unknown>(request: JsonCompletionRequest) => Promise<TResult>;
    testImageModel: (config: ClientConfig) => Promise<ImageModelTestResult>;
    onHttpError: (callback: (event: AiHttpErrorPayload) => void) => () => void;
    /** Triggered when the official Savia API reports insufficient balance; the main window handles navigation to top-up. */
    onBalanceInsufficient: (callback: () => void) => () => void;
  };
  autoConfirmation: {
    getState: () => Promise<AutoConfirmationState>;
    setEnabled: (enabled: boolean) => Promise<ConfigSaveResult & AutoConfirmationState>;
    onChanged: (callback: (state: AutoConfirmationState) => void) => () => void;
  };
  agent: {
    run: (payload: AgentRunPayload) => Promise<AgentRunResult>;
    selfCheck: () => Promise<AgentSelfCheckResult>;
    exportSelfCheckReport: (payload: AgentSelfCheckResult) => Promise<AgentSelfCheckReportExportResult>;
    getStatus: () => Promise<AgentRuntimeStatus>;
    restart: (reason?: string) => Promise<AgentRuntimeStatus>;
    getPendingQuestion: () => Promise<AgentQuestion | null>;
    answerQuestion: (payload: AgentQuestionAnswerPayload) => Promise<AgentQuestionAnswerResult>;
    suppressQuestionAutoAnswer: (payload: { question_id: string }) => Promise<{ success: boolean }>;
    onStatus: (callback: (status: AgentRuntimeStatus) => void) => () => void;
    onQuestion: (callback: (question: AgentQuestion | null) => void) => () => void;
  };
  developerTokenStats: {
    openWindow: () => Promise<{ success: boolean }>;
    get: () => Promise<DeveloperTextTokenStats>;
    reset: () => Promise<DeveloperTextTokenStats>;
    onChanged: (callback: (stats: DeveloperTextTokenStats) => void) => () => void;
  };
  developerAgentMonitor: {
    exportSession: (payload: { taskId: string; sessionId: string; language: 'es' | 'en' }) => Promise<{ canceled: boolean; path?: string }>;
    exportLogs: () => Promise<{ canceled: boolean; path?: string }>;
    openLogs: () => Promise<{ success: boolean }>;
    openWindow: () => Promise<{ success: boolean }>;
    openWorkspace: (workspaceDir: string) => Promise<{ success: boolean; path: string }>;
    attach: () => Promise<AgentMonitorSnapshot>;
    detach: () => Promise<{ success: boolean }>;
    onEvent: (callback: (event: AgentMonitorEvent) => void) => () => void;
  };
  developerExpansionReplaceTest: {
    run: (payload: DeveloperExpansionReplaceTestPayload) => Promise<DeveloperExpansionReplaceTestResult>;
  };
  developerLayoutFigure: {
    /** Clear images generated in the previous round and return the test asset directory name. */
    reset: () => Promise<{ assetRoot: string }>;
    /** Generate a real image using the skeleton's frame ratio. */
    render: (payload: DeveloperLayoutFigureRequest) => Promise<DeveloperLayoutFigureResult>;
    /** Render a sample using the test asset directory and actually generated images. */
    renderPreview: (html: string, config: ExportFormatConfig) => Promise<{ key: string; bytes: Uint8Array; roles: string[] }>;
  };
  file: {
    selectDuplicateCheckFiles: (options?: { multiple?: boolean; filePaths?: string[] }) => Promise<FileSelectionResult>;
    /** Anonymous-bid compliance checking accepts a single .docx only. */
    selectBlindCheckFile: (options?: { filePaths?: string[] }) => Promise<FileSelectionResult>;
    selectBlindCheckTenderFile: () => Promise<FileSelectionResult>;
    /** Convert a dropped File object to its absolute local path for upload-area drag-and-drop imports. */
    getPathForFile: (file: File) => string;
  };
  knowledgeBase: {
    list: () => Promise<KnowledgeBaseIndex>;
    search: (request: KnowledgeBaseSearchRequest) => Promise<KnowledgeBaseSearchPage>;
    createFolder: (name: string) => Promise<KnowledgeFolder>;
    renameFolder: (folderId: string, name: string) => Promise<KnowledgeFolder>;
    reorderFolder: (draggedFolderId: string, targetFolderId: string, position: 'before' | 'after') => Promise<KnowledgeBaseIndexMutationResult>;
    deleteFolder: (folderId: string) => Promise<KnowledgeBaseMutationResult>;
    deleteDocument: (documentId: string) => Promise<KnowledgeBaseMutationResult>;
    moveDocument: (documentId: string, targetFolderId: string, targetDocumentId?: string | null, position?: 'before' | 'after') => Promise<KnowledgeBaseIndexMutationResult>;
    uploadDocuments: (folderId: string) => Promise<KnowledgeBaseUploadResult>;
    retryDocument: (documentId: string) => Promise<KnowledgeBaseRetryDocumentResult>;
    startMatching: (documentId: string, batchSize?: number) => Promise<KnowledgeBaseStartMatchingResult>;
    readMarkdown: (documentId: string) => Promise<string>;
    readItems: (documentId: string) => Promise<KnowledgeItem[]>;
    readAnalysis: (documentId: string) => Promise<KnowledgeAnalysisSnapshot>;
    onEvent: (callback: (event: KnowledgeBaseEvent) => void) => () => void;
  };
  credentialLibrary: {
    getRup: () => Promise<{name:string;importedAt:string;issuedOn:string}|null>;
    readRup: () => Promise<Uint8Array>;
    extractRup: () => Promise<Array<{page:number;text:string;layoutText:string}>>;
    analyzeRup: (language:string) => Promise<{suggestions:Array<{label:string;value:string;page:number;quote:string}>;rejectedCount:number;pagesWithoutText:number[]}>;
    setRupIssueDate: (value:string) => Promise<{name:string;importedAt:string;issuedOn:string}>;
    listRupFacts: () => Promise<Array<{id:string;label:string;value:string;page:number}>>;
    addRupFact: (input:{label:string;value:string;page:number}) => Promise<{id:string;label:string;value:string;page:number}>;
    updateRupFact: (id:string,input:{label:string;value:string;page:number}) => Promise<{id:string;label:string;value:string;page:number}>;
    removeRupFact: (id:string) => Promise<boolean>;
    importRup: () => Promise<{name:string;importedAt:string;issuedOn:string}|null>;
    load: () => Promise<CredentialLibrarySnapshot>;
    importTestData: () => Promise<CredentialLibraryImportResult | null>;
    saveProfile: (partial: Partial<CredentialLibraryProfile>) => Promise<CredentialLibrarySnapshot>;
    addProfileImages: (fieldKey: CredentialImageFieldKey, filePaths: string[]) => Promise<CredentialLibrarySnapshot>;
    deleteImage: (imageId: string) => Promise<CredentialLibraryMutationResult>;
    saveCertificate: (payload: CredentialRecordSavePayload<CredentialCertificate>) => Promise<CredentialLibraryMutationResult>;
    deleteCertificate: (recordId: string) => Promise<CredentialLibraryMutationResult>;
    saveEmployee: (payload: CredentialRecordSavePayload<CredentialEmployee>) => Promise<CredentialLibraryMutationResult>;
    deleteEmployee: (recordId: string) => Promise<CredentialLibraryMutationResult>;
    saveProject: (payload: CredentialRecordSavePayload<CredentialProject>) => Promise<CredentialLibraryMutationResult>;
    deleteProject: (recordId: string) => Promise<CredentialLibraryMutationResult>;
    saveOtherMaterial: (payload: CredentialRecordSavePayload<CredentialOtherMaterial>) => Promise<CredentialLibraryMutationResult>;
    deleteOtherMaterial: (recordId: string) => Promise<CredentialLibraryMutationResult>;
  };
  technicalPlan: {
    loadState: () => Promise<TechnicalPlanState>;
    loadGenerationConfig: () => Promise<TechnicalPlanGenerationConfig>;
    saveGenerationConfig: (partial: Partial<TechnicalPlanGenerationConfig>) => Promise<TechnicalPlanGenerationConfig>;
    seedSecopOpportunity: (payload: { name: string; overview: string; processId?: string; portfolioId?: string }) => Promise<{ success: boolean; name: string; hasOverview: boolean }>;
    importTenderDocument: (filePaths?: string[]) => Promise<{
      success: boolean;
      message?: string;
      markdown?: string;
      fileName?: string;
      parserLabel?: string | null;
    }>;
    removeTenderDocument: (sourceId: string) => Promise<{
      success: boolean;
      message?: string;
      markdown?: string;
    }>;
    importOriginalPlanDocument: (filePaths?: string[]) => Promise<{
      success: boolean;
      message?: string;
      markdown?: string;
    }>;
    removeOriginalPlanDocument: () => Promise<{ success: boolean; message?: string }>;
    checkBidSections: () => Promise<{ hasMultiple: boolean; totalDeclared?: number | null }>;
    selectBidSection: (selectedSection: DetectedBidSection) => Promise<{ success: boolean; message?: string; markdown: string }>;
    readTenderMarkdown: () => Promise<string>;
    readContentWord: (sectionId: string) => Promise<Uint8Array | null>;
    previewContentWord: (sectionId: string) => Promise<Uint8Array | null>;
    readTenderSourceMarkdown: (sourceId: string) => Promise<string>;
    updateStep: (step: TechnicalPlanStep) => Promise<void>;
    saveBidAnalysisConfig: (payload: { mode: BidAnalysisMode; selectedTaskIds: string[]; bidSectionMode?: BidSectionMode }) => Promise<void>;
    saveOutlineSelection: (payload: SaveOutlineSelectionRequest) => Promise<{ success: boolean }>;
    saveOutline: (payload: SaveOutlineRequest) => Promise<Partial<TechnicalPlanState>>;
    saveGlobalFacts: (globalFacts: GlobalFactGroupState[]) => Promise<Partial<TechnicalPlanState>>;
    saveContentGenerationOptions: (options: ContentGenerationOptions) => Promise<Partial<TechnicalPlanState>>;
    saveChapterContent: (payload: { nodeId: string; content: string }) => Promise<Partial<TechnicalPlanState>>;
    resetContentGeneration: () => Promise<TechnicalPlanState>;
    clear: () => Promise<{ success: boolean; message?: string }>;
    openBidTemplate: () => Promise<{ success: boolean; message?: string }>;
  };
  feasibilityReport: {
    loadState: () => Promise<FeasibilityReportState>;
    importSourceDocuments: (filePaths?: string[]) => Promise<{ success: boolean; message?: string; sourceFiles?: FeasibilitySourceFile[] }>;
    removeSourceDocument: (sourceId: string) => Promise<{ success: boolean; message?: string; sourceFiles?: FeasibilitySourceFile[] }>;
    readSourceMarkdown: (sourceId: string) => Promise<string>;
    readCombinedSourceMarkdown: () => Promise<string>;
    updateStep: (step: FeasibilityReportStep) => Promise<void>;
    saveProjectInfo: (projectInfo: FeasibilityProjectInfo) => Promise<FeasibilityReportState>;
    saveAnalysis: (markdown: string) => Promise<FeasibilityReportState>;
    saveOutlineConfig: (payload: { outlineTemplate?: string; targetWords?: number; referenceDocumentIds?: string[] }) => Promise<FeasibilityReportState>;
    saveOutline: (payload: FeasibilitySaveOutlineRequest) => Promise<Partial<FeasibilityReportState>>;
    saveKeyParameters: (markdown: string) => Promise<FeasibilityReportState>;
    saveChapterContent: (payload: { nodeId: string; content: string }) => Promise<Partial<FeasibilityReportState>>;
    clear: () => Promise<{ success: boolean; message?: string }>;
  };
  duplicateCheck: {
    loadState: () => Promise<DuplicateCheckWorkspaceState>;
    saveFiles: (payload: Pick<DuplicateCheckWorkspaceState, 'tenderFile' | 'tenderFiles' | 'bidFiles'> & Partial<Pick<DuplicateCheckWorkspaceState, 'step' | 'activeAnalysisTab'>>) => Promise<void>;
    saveUiState: (payload: Partial<Pick<DuplicateCheckWorkspaceState, 'step' | 'activeAnalysisTab'>>) => Promise<void>;
    updateState: (partial: DuplicateCheckWorkspacePatch) => Promise<void>;
    clear: () => Promise<{ success: boolean; message?: string }>;
    exportExcel: (request: { signature: string }) => Promise<CheckResultExportResult>;
  };
  rejectionCheck: {
    loadState: () => Promise<RejectionCheckWorkspaceState>;
    importDocument: (role: RejectionDocumentRole, filePaths?: string[]) => Promise<{ success: boolean; message?: string }>;
    importTenderFromTechnicalPlan: () => Promise<{ success: boolean; message?: string }>;
    removeDocument: (role: RejectionDocumentRole, documentId?: string) => Promise<void>;
    saveUiState: (payload: Partial<Pick<RejectionCheckWorkspaceState, 'step' | 'activeDocumentTab' | 'activeResultTab' | 'activeCheckResultTab' | 'customCheckItems' | 'checkOptions'>>) => Promise<void>;
    updateState: (partial: RejectionCheckWorkspacePatch) => Promise<void>;
    exportExcel: (request: { rejectionInputSignature: string; bidSignature: string }) => Promise<CheckResultExportResult>;
    clear: () => Promise<{ success: boolean; message?: string }>;
  };
  blindCheck: {
    loadState: () => Promise<BlindCheckWorkspaceState>;
    /** Copy to the workspace as the document to check; cancels any running check. */
    importFile: (filePath: string) => Promise<BlindCheckWorkspaceState>;
    removeFile: () => Promise<BlindCheckWorkspaceState>;
    saveUiState: (payload: Partial<Pick<BlindCheckWorkspaceState, 'step' | 'presetTab' | 'resultTab'>>) => Promise<void>;
    listPresets: () => Promise<BlindCheckPreset[]>;
    /** Create a user preset based on basePresetId and select it. */
    createPreset: (payload: { name?: string; basePresetId: string }) => Promise<BlindCheckPreset>;
    updatePreset: (presetId: string, patch: { name?: string; profile?: BlindCheckProfile }) => Promise<BlindCheckPreset>;
    deletePreset: (presetId: string) => Promise<BlindCheckPreset[]>;
    selectPreset: (presetId: string) => Promise<BlindCheckWorkspaceState>;
    setUseCredentialWords: (enabled: boolean) => Promise<BlindCheckWorkspaceState>;
    getCredentialWords: () => Promise<BlindCheckCredentialWord[]>;
    /** Input signature for the current document, preset, and sensitive words; null when no document is selected. */
    getInputSignature: () => Promise<string | null>;
    saveFixRules: (rules: string[]) => Promise<BlindCheckWorkspaceState>;
    saveFixedDocument: () => Promise<CheckResultExportResult>;
    getTenderSources: () => Promise<BlindCheckTenderSources>;
    clear: () => Promise<BlindCheckWorkspaceState>;
  };
  templates: {
    colombia: () => Promise<Array<{ id: string; name: string; nameEn: string; summary: string; summaryEn: string; source: string; reviewedAt: string; html: string; config: ExportFormatConfig }>>;
    list: () => Promise<ExportTemplateRecord[]>;
    get: (templateId: string) => Promise<ExportTemplateRecord | null>;
    create: (config: ExportFormatConfig) => Promise<ExportTemplateRecord>;
    update: (templateId: string, config: ExportFormatConfig) => Promise<ExportTemplateRecord>;
    delete: (templateId: string) => Promise<{ success: boolean; message: string }>;
    duplicate: (templateId: string) => Promise<ExportTemplateRecord>;
    /** Generate a template sample; key is its content fingerprint, allowing reload to be skipped when bytes are unchanged. */
    renderPreview: (html: string, config: ExportFormatConfig) => Promise<{ key: string; bytes: Uint8Array; roles: string[] }>;
  };
  tasks: {
    startBidSectionExtraction: (payload?: unknown) => Promise<unknown>;
    startBidAnalysis: (payload: unknown) => Promise<unknown>;
    startOutlineGeneration: (payload: unknown) => Promise<unknown>;
    suppressOutlineSelectionAutoConfirmation: (payload: { taskId: string }) => Promise<{ success: boolean }>;
    startGlobalFactsGeneration: (payload: unknown) => Promise<unknown>;
    startContentGeneration: (payload: unknown) => Promise<unknown>;
    pauseContentGeneration: () => Promise<unknown>;
    startRejectionItemsExtraction: (payload: unknown) => Promise<unknown>;
    startRejectionCheck: (payload: unknown) => Promise<unknown>;
    startDuplicateAnalysis: (payload: unknown) => Promise<unknown>;
    /** aiReview: program-only check (false) or program check plus AI review (true). */
    startBlindCheck: (payload: { aiReview: boolean }) => Promise<unknown>;
    /** ai: program-only repair (false) or program repair plus AI repair (true). */
    startBlindCheckFix: (payload: { ai: boolean }) => Promise<unknown>;
    startBlindCheckPresetExtraction: (payload: { source: 'technical-plan' | 'file'; filePath?: string }) => Promise<unknown>;
    startFeasibilityAnalysis: (payload?: unknown) => Promise<unknown>;
    startFeasibilityOutline: (payload?: unknown) => Promise<unknown>;
    startFeasibilityParameters: (payload?: unknown) => Promise<unknown>;
    startFeasibilityContent: (payload?: unknown) => Promise<unknown>;
    pauseFeasibilityContent: () => Promise<unknown>;
    startFeasibilityHumanWriting: (payload?: unknown) => Promise<unknown>;
    getActiveTasks: () => Promise<TaskEventTask[]>;
    onTaskEvent: <TState = unknown, TRejectionCheckState = unknown, TDuplicateCheckState = unknown>(callback: (event: TaskEvent<TState, TRejectionCheckState, TDuplicateCheckState>) => void) => () => void;
  };
  export: {
    exportWord: (payload: unknown) => Promise<WordExportResult>;
    /** End the export request when the user cancels body-structure confirmation. */
    openFile: (filePath: string) => Promise<{ success: boolean }>;
    onWordExportProgress: (callback: (event: WordExportProgressEvent) => void) => () => void;
  };
  systemFonts: {
    list: () => Promise<string[]>;
  };
  secop: SecopBridge;
  bidEvaluation: {
    export: (id: string, language: string) => Promise<boolean>;
    getState: () => Promise<BidEvaluationState>;
    importDocuments: (paths?: string[]) => Promise<{documents: BidEvaluationSource[]; errors: string[]; canceled: boolean; message: string}>;
    removeDocument: (id: string) => Promise<boolean>;
    start: (input: {tenderIds: string[]; bidIds: string[]; language: string}) => Promise<BidEvaluationRun>;
    cancel: (id: string) => Promise<boolean>;
    getRun: (id: string) => Promise<BidEvaluationRun | null>;
    saveReview: (id: string, criterionId: string, review: {status: BidEvaluationReview['status']; score: number | null; note: string}) => Promise<BidEvaluationRun>;
    onEvent: (callback: (event: {projectId: string}) => void) => () => void;
  };
  tenderChat: {
    previewDocument: (sourceId: string) => Promise<{ kind: 'pdf' | 'docx' | 'markdown'; bytes?: Uint8Array; markdown?: string; originalAvailable: boolean }> ;
    getState: () => Promise<{ projectId: string; messages: TenderChatMessage[]; running: boolean; sources: Array<{ id: string; fileName: string }> }>;
    importDocuments: (filePaths?: string[]) => Promise<{ success: boolean; message?: string; markdown?: string; importErrors?: string[]; restoredCount?: number }>;
    send: (question: string, language: string, selectedIds?: string[]) => Promise<string>;
    cancel: () => Promise<void>;
    clear: () => Promise<void>;
    onEvent: (callback: (event: { projectId: string; messages?: TenderChatMessage[]; running: boolean; activity?: string }) => void) => () => void;
  };
  technicalProjects: { switch: (id: string) => Promise<{ success: boolean }>; list: () => Promise<Array<{ id: string; title: string; isCurrent: boolean; updatedAt: string }>> };
  secopContinuity: { list:(id:string)=>Promise<Array<{candidate:SecopProcess;confirmedAt:string;stale:boolean}>>; find:(id:string)=>Promise<{items:SecopProcess[];truncated:boolean}>; confirm:(id:string,candidate:SecopProcess)=>Promise<Array<{candidate:SecopProcess;confirmedAt:string;stale:boolean}>>;remove:(id:string,candidateId:string)=>Promise<Array<{candidate:SecopProcess;confirmedAt:string;stale:boolean}>> };
  officialForm: { choose:(processId:string,language:string)=>Promise<{id:string;name:string;format:'pdf'|'docx';fields:Array<{candidate_id:string;kind:string;context?:string;suggested_name?:string;row_number?:number;column_number?:number;page?:number;rect?:[number,number,number,number];maxLength?:number;originalValue?:string;editable:boolean;suggestion:OfficialFormSuggestion|null;suggestions:OfficialFormSuggestion[]}>;contexts:Array<{context_id:string;table_title?:string;column_header?:string}>}|null>;previewPdf:(id:string)=>Promise<Uint8Array>;exportCopy:(id:string,values:Array<{candidate_id:string;value:string}>,language:string)=>Promise<boolean> };
  citationSource: {open:(processId:string,sourceId:string,quote:string,language?:string,kind?:'tender'|'offer')=>Promise<{kind:'pdf'|'docx'|'markdown';originalAvailable:boolean;pages:number[];totalPages:number;locationUnavailable?:boolean;bytes?:Uint8Array}>};
  economicOffer: {get:(id:string)=>Promise<EconomicOfferSaved|null>;calculate:(draft:EconomicOfferDraft)=>Promise<EconomicOfferCalculation>;save:(id:string,draft:EconomicOfferDraft)=>Promise<EconomicOfferSaved>;export:(id:string,draft:EconomicOfferDraft,language:string)=>Promise<boolean>};
  requirementSuggestions: {getState:(id:string)=>Promise<RequirementSuggestionState>;start:(id:string,language:string)=>Promise<{id:string;status:'running'}>;accept:(id:string,runId:string,suggestionId:string)=>Promise<TenderRequirement>;onEvent:(callback:(event:{processId:string})=>void)=>()=>void};
  addendumImpact: { getState:(id:string)=>Promise<AddendumImpactState>;start:(id:string,addendumId:string,language:string)=>Promise<{id:string;status:'running'}>;review:(id:string,runId:string,impactId:string,review:{status:'pending'|'reviewed';note:string})=>Promise<AddendumImpactState>;onEvent:(callback:(event:{processId:string})=>void)=>()=>void };
  secopAgenda: { getState: () => Promise<SecopAgendaItem[]> };
  paaWatch: { getState:()=>Promise<PaaWatchState>;follow:(id:string)=>Promise<PaaWatchState>;unfollow:(id:string)=>Promise<PaaWatchState>;refresh:()=>Promise<PaaWatchState>;markReviewed:(id:string)=>Promise<PaaWatchState>;onChanged:(callback:(state:PaaWatchState)=>void)=>()=>void };
  secopWatch: {
    getState: () => Promise<SecopWatchState>;
    refresh: () => Promise<SecopWatchState>;
    markReviewed: (id: string) => Promise<SecopWatchState>;
    onChanged: (callback: (state: SecopWatchState) => void) => () => void;
  };
  opportunitySuggestions: {
    getState: () => Promise<OpportunitySuggestionsState>;
    saveSettings: (settings: { enabled: boolean; keywords: string }) => Promise<OpportunitySuggestionsState>;
    refresh: () => Promise<OpportunitySuggestionsState>;
    markReviewed: (source: SecopProcess['source'], id: string) => Promise<OpportunitySuggestionsState>;
    addToLibrary: (source: SecopProcess['source'], id: string) => Promise<OpportunitySuggestionsState>;
    onChanged: (callback: (state: OpportunitySuggestionsState) => void) => () => void;
  };
  technicalPlanAi: { status: () => Promise<{workspaceId:string;projectId:string;ready:boolean;hasGeneratedContent:boolean}>; send: (payload:{workspaceId:string;projectId:string;message:string;confirmed:boolean}) => Promise<{success:boolean}> };
  secopLibrary: {
    list: () => Promise<SavedTenderSummary[]>;
    get: (id: string) => Promise<SavedTenderDetail | null>;
    save: (process: Partial<SecopProcess> & { id: string }, documents: SecopDocument[]) => Promise<SavedTenderDetail>;
    saveCurrent: () => Promise<SavedTenderDetail | null>;
    setWorkStage: (id: string, stage: TenderWorkStage) => Promise<SavedTenderDetail>;
    listRequirements: (id: string) => Promise<TenderRequirement[]>;
    exportRequirements: (id: string, language: string, format: 'csv'|'xlsx') => Promise<boolean>;
    addRequirement: (id: string, input: { title: string; source: string; evidence: string; category?: TenderRequirement['category'] }) => Promise<TenderRequirement>;
    updateRequirement: (id: string, itemId: string, input: { title: string; status: TenderRequirementStatus; source: string; evidence: string; category?: TenderRequirement['category'] }) => Promise<TenderRequirement>;
    removeRequirement: (id: string, itemId: string) => Promise<boolean>;
    getRupComparison: (id:string,itemId:string) => Promise<RupComparisonSnapshot|null>;
    saveRupComparison: (id:string,itemId:string,input:{factId:string;operator:'gte'|'lte';threshold:string;interpretedValue?:string}) => Promise<RupComparisonSnapshot>;
    readRupComparison: (id:string,itemId:string) => Promise<Uint8Array>;
    listWorkTasks: (id: string) => Promise<TenderWorkTask[]>;
    addWorkTask: (id: string, input: { title: string; dueDate: string }) => Promise<TenderWorkTask>;
    setWorkTaskCompleted: (id: string, taskId: string, completed: boolean) => Promise<TenderWorkTask>;
    removeWorkTask: (id: string, taskId: string) => Promise<boolean>;
    remove: (id: string) => Promise<boolean>;
    removeAll: () => Promise<number>;
  };
  plugins: {
    getAvailablePlugins: () => Promise<AvailablePlugin[]>;
    install: (pluginId: string) => Promise<void>;
    installOffline: () => Promise<OfflinePluginInstallResult>;
    uninstall: (pluginId: string) => Promise<void>;
    enable: (pluginId: string) => Promise<void>;
    disable: (pluginId: string) => Promise<void>;
    update: (pluginId: string) => Promise<void>;
    checkUpdates: () => Promise<PluginUpdateInfo[]>;
    updateAll: () => Promise<PluginUpdateAllResult>;
    openConfig: (pluginId: string) => Promise<void>;
    refreshMarket: () => Promise<void>;
    clearUpdateFailedState: (pluginId: string) => Promise<boolean>;
    notifyEvent: (pluginId: string, event: string, payload?: unknown) => Promise<void>;
  };
}

export type OfflinePluginInstallResult =
  | { canceled: true }
  | {
      canceled: false;
      id: string;
      name: string;
      version: string;
      previousVersion: string | null;
      updated: boolean;
      enabled: boolean;
    };

export interface AvailablePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  repository: string;
  releaseUrl: string;
  tags: string[];
  iconUrl: string;
  downloadCount: number;
  installed: boolean;
  installedVersion?: string;
  enabled: boolean;
  hasConfig: boolean;
  hasUpdate?: boolean;
  updating?: boolean;
  updateFailed?: {
    stage: string;
    message: string;
  };
}
