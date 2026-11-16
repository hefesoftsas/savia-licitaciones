import type { ClientConfig } from '../types/config';

// Telemetry removed: this module preserves signatures for compatibility with
// callers, but does not make any network requests.

export interface ConfigUsagePayload {
  file_parser_provider?: string;
  image_provider?: string;
  image_model_status?: string;
  bid_analysis_mode?: string;
  outline_mode?: string;
  outline_expansion_mode?: string;
  table_requirement?: string;
  use_mermaid_images?: boolean;
  use_ai_images?: boolean;
  image_quantity?: number;
  image_layout_single?: boolean;
  image_layout_image_text?: boolean;
  image_layout_three_images?: boolean;
  image_layout_four_images?: boolean;
  content_concurrency?: number;
  content_generation_action?: string;
  word_control_enabled?: boolean;
  minimum_words?: number;
  maximum_words?: number;
  section_words?: number;
  enable_consistency_audit?: boolean;
  consistency_repair_mode?: string;
  enable_original_plan_coverage_audit?: boolean;
  original_plan_coverage_repair_mode?: string;
}

export function isAnalyticsEnabled(): Promise<boolean> {
  return Promise.resolve(false);
}

export function resetAnalyticsEnabledCache() {
  // No cache: telemetry is permanently removed.
}

export function trackAppOpen() {
  // No-op: telemetry removed.
}

export function trackPageView(_page: string) {
  // No-op: telemetry removed.
}

export function trackChangelogOpen() {
  // No-op: telemetry removed.
}

export function trackConfigUsage(_payload: ConfigUsagePayload = {}, _config?: ClientConfig | null) {
  // No-op: telemetry removed.
}

export function trackResourceClick(_resourceKey: string) {
  // No-op: telemetry removed.
}

export function trackNoticeBoardOpen() {
  // No-op: telemetry removed.
}
