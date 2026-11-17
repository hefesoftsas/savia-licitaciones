export type SecopSource = 'secop-ii' | 'secop-i' | 'placsp';
export type SecopDataset = SecopSource | 'contratos';
export type SecopCategory = 'department' | 'modality' | 'status';
export type ProcurementMarket = 'CO' | 'ES' | 'ALL';

export interface SecopProcess {
  id: string;
  portfolioId?: string;
  reference?: string;
  classificationCode?: string;
  cpvCodes?: string[];
  country?: 'CO' | 'ES';
  entity: string;
  title: string;
  modality?: string;
  status?: string;
  phase?: string;
  value?: number | null;
  currency?: string;
  currencyVerified?: boolean;
  publicationDate?: string;
  deadline?: string;
  deadlineVerified?: boolean;
  department?: string;
  territory?: string;
  city?: string;
  url?: string;
  source: SecopSource;
}

export interface OpportunitySuggestionsState {
  enabled: boolean;
  keywords: string;
  terms: string[];
  hasRup: boolean;
  lastAttempt: string;
  lastSuccess: string;
  error: string;
  running: boolean;
  profileChanged: boolean;
  unreadCount: number;
  items: Array<{ process: SecopProcess; reason: string; checks: string; reviewed: boolean; saved: boolean; rupMatches?: Array<{ code: string; page: number }> }>;
}

export type SecopColumn = 'title' | 'entity' | 'modality' | 'status' | 'value' | 'publicationDate' | 'deadline' | 'department';
export interface SecopSearchParams {
  openOnly?: boolean;
  classificationClass?: string;
  cpvCode?: string;
  sortBy?: SecopColumn;
  sortDirection?: 'asc' | 'desc';
  columnFilters?: Partial<Record<SecopColumn, string>>;
  keyword?: string;
  department?: string | string[];
  territory?: string | string[];
  modality?: string | string[];
  status?: string | string[];
  minValue?: number;
  maxValue?: number;
  fromDate?: string;
  limit?: number;
  offset?: number;
  dataset?: SecopSource | 'contratos';
}

export interface SecopSearchResult {
  items: SecopProcess[];
  truncated: boolean;
}

export interface SecopDocument {
  id: string;
  name: string;
  extension: string;
  size: number | null;
  date?: string;
  description?: string;
  url?: string;
}

export type TenderWorkStage = 'evaluating' | 'preparing' | 'submitted' | 'awarded' | 'not_awarded' | 'discarded';

export type TenderRequirementCategory = 'general' | 'legal' | 'financial' | 'technical' | 'experience';
export type TenderRequirementStatus = 'pending' | 'meets' | 'does_not_meet' | 'unknown';
export interface TenderRequirement {
  id: string;
  processId: string;
  title: string;
  source: string;
  evidence: string;
  status: TenderRequirementStatus;
  category: TenderRequirementCategory;
  createdAt: string;
  updatedAt: string;
}

export interface TenderWorkTask {
  id: string;
  processId: string;
  title: string;
  dueDate: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedTenderSummary {
  workStage: TenderWorkStage;
  id: string;
  process: Partial<SecopProcess> & { id: string; title?: string; source?: string };
  summary: string;
  analysisCount: number;
  failedCount: number;
  importedCount: number;
  officialCount: number;
  updatedAt: string;
  isCurrent: boolean;
  hasProject: boolean;
}
export interface SavedTenderDetail {
  workStage: TenderWorkStage;
  id: string;
  process: SavedTenderSummary['process'];
  summary: string;
  analysis: Record<string, { status: string; content: string; error: string }>;
  importedDocuments: Array<{ id: string; name: string; text: string }>;
  officialDocuments: Array<{ id: string; name: string; extension: string; date?: string }>;
  updatedAt: string;
}

export interface SecopSearchPreferences {
  dataset: SecopDataset;
  department: string[];
  modality: string[];
  status: string[];
}

export interface ProcurementPlanItem { id:string; planId:string; description:string; entity:string; year:number|null; startDate:string; offerDate:string; value:number|null; classifications:string; modality:string; version:string; versionDate:string }
export interface ContractHistoryItem { id:string; entity:string; supplier:string; supplierId:string; description:string; date:string; value:number|null; status?:string }
export interface ContractAggregates {records:number;contracts:number;values:number;from:string;to:string;minimum:number|null;maximum:number|null;average:number|null;checkedAt:string;sourceUrl:string}
export interface PublicSearchInput { keyword?:string; entity?:string; supplier?:string; year?:number; offset?:number; limit?:number; source?:'tvec' }
export interface PublicSearchResult<T> { success:boolean; data?: { items:T[]; hasMore:boolean }; message:string }
export interface SecopBridge {
  searchProcurementPlans: (input: PublicSearchInput) => Promise<PublicSearchResult<ProcurementPlanItem>>;
  searchContractHistory: (input: PublicSearchInput) => Promise<PublicSearchResult<ContractHistoryItem>>;
  getContractAggregates: (input: PublicSearchInput) => Promise<{success:boolean;data?:ContractAggregates;message:string}>;
  getSearchPreferences: () => Promise<SecopSearchPreferences | null>;
  saveSearchPreferences: (preferences: SecopSearchPreferences) => Promise<void>;
  exportProcesses: (payload: { items: SecopProcess[]; columns: SecopColumn[]; format: 'csv' | 'xlsx'; language: 'es' | 'en' }) => Promise<{ canceled: boolean; filePath?: string }>;
  getFilterOptions: (dataset: SecopDataset, category: SecopCategory) => Promise<{ success: boolean; data?: string[]; message: string }>;
  searchProcesses: (params: SecopSearchParams) => Promise<{ success: boolean; data?: SecopSearchResult; message: string }>;
  getProcessDetail: (id: string, source?: SecopSource) => Promise<{ success: boolean; data?: SecopProcess | null; message: string }>;
  getProcessDocuments: (portfolioId: string, offset?: number) => Promise<{ success: boolean; data?: { items: SecopDocument[]; truncated: boolean; partial?: boolean }; message: string }>;
  importProcessDocuments: (portfolioId: string, ids: string[], options?: { invalidateDerived?: boolean }) => Promise<{ success: boolean; downloaded?: number; skipped?: number; duplicateCount?: number; importErrors?: string[]; message?: string; markdown?: string }>;
}
