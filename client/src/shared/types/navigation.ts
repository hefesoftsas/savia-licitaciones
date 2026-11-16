export type SectionId =
  | 'proposal-wizard'
  | 'bid-generation'
  | 'technical-plan'
  | 'tender-chat'
  | 'feasibility-report'
  | 'knowledge-base'
  | 'document-knowledge-base'
  | 'credential-library'
  | 'image-knowledge-base'
  | 'resource-download'
  | 'resources'
  | 'bid-check'
  | 'duplicate-check'
  | 'rejection-check'
  | 'blind-check'
  | 'ai-evaluation'
  | 'template-settings'
  | 'secop-agenda'
  | 'secop-market'
  | 'secop-opportunities'
  | 'suggested-opportunities'
  | 'secop-library'
  | 'developer-test'
  | 'developer-json-test'
  | 'developer-multimodal-test'
  | 'developer-prompt-lab'
  | 'developer-parser-sandbox'
  | 'developer-export-preview'
  | 'developer-expansion-replace-test'
  | 'developer-layout-budget-test'
  | 'developer-agent-test'
  | 'settings'
  | 'plugin-manager';

export interface AppMenuNotice {
  message: string;
  actionLabel?: string;
  externalUrl?: string;
}

export interface AppSubMenuItem {
  id: SectionId;
  label: string;
  description: string;
  icon?: 'document' | 'expand' | 'briefcase' | 'compare' | 'shield' | 'code' | 'prompt' | 'file' | 'export' | 'tool';
  badge?: string;
  notice?: AppMenuNotice;
}

export interface AppMenuItem {
  id: SectionId;
  label: string;
  description: string;
  children?: AppSubMenuItem[];
  notice?: AppMenuNotice;
}
