// Coverage inventory only: no entry is approved for export or restore yet.
// Keep this list explicit so schema changes fail the coverage test.
const scopes={
  "owner": [
    "account_model_selection",
    "runner_poll_preferences",
    "navigation_preferences",
    "agenda_layout_preferences",
    "project_selection",
    "desktop_addendum_imports",
    "secop_search_preferences",
    "account_company_profile_snapshot_image_imports",
    "account_company_profile_snapshot_imports",
    "account_job_questions",
    "account_jobs",
    "agenda_reminder_settings",
    "agenda_reminders",
    "company_certificate_image_deletions",
    "company_certificate_images",
    "company_certificates",
    "company_experience_image_deletions",
    "company_experience_images",
    "company_experience_projects",
    "company_profile_image_deletions",
    "company_profile_images",
    "company_profiles",
    "desktop_analysis_imports",
    "desktop_bid_evaluation_imports",
    "desktop_blind_profile_imports",
    "desktop_blind_task_imports",
    "desktop_certificate_image_imports",
    "desktop_certificate_imports",
    "desktop_chat_imports",
    "desktop_company_experience_image_imports",
    "desktop_company_experience_imports",
    "desktop_company_profile_image_imports",
    "desktop_company_profile_imports",
    "desktop_export_format_imports",
    "desktop_export_template_imports",
    "desktop_fact_imports",
    "desktop_feasibility_imports",
    "desktop_feasibility_sources",
    "desktop_file_staging",
    "desktop_image_library_imports",
    "desktop_knowledge_document_imports",
    "desktop_knowledge_folder_imports",
    "desktop_offer_imports",
    "desktop_opportunity_tracking_imports",
    "desktop_offer_document_imports",
    "desktop_paa_imports",
    "desktop_plan_file_imports",
    "desktop_plan_imports",
    "desktop_rejection_draft_imports",
    "desktop_review_task_imports",
    "desktop_requirement_id_map",
    "desktop_task_id_map",
    "desktop_requirement_support_imports",
    "desktop_requirement_support_id_map",
    "desktop_support_certificate_map",
    "desktop_submission_tracking_imports",
    "desktop_submission_record_imports",
    "desktop_submission_attachment_imports",
    "desktop_rup_fact_id_map",
    "desktop_rup_imports",
    "desktop_saved_tender_imports",
    "desktop_secop_imports",
    "desktop_workflow_imports",
    "export_format_settings",
    "export_format_templates",
    "feasibility_analysis_applications",
    "feasibility_assets",
    "feasibility_content_applications",
    "feasibility_content_drafts",
    "feasibility_content_reviews",
    "feasibility_extracted_images",
    "feasibility_extracted_texts",
    "feasibility_outline_applications",
    "feasibility_parameters_applications",
    "feasibility_reports",
    "feasibility_snapshot_imports",
    "feasibility_snapshot_job_aliases",
    "feasibility_snapshot_objects",
    "feasibility_source_selections",
    "feasibility_web_source_deletions",
    "feasibility_web_sources",
    "image_library_restores",
    "image_library_web",
    "imported_duplicate_check_files",
    "imported_duplicate_checks",
    "imported_rup_comparisons",
    "job_questions",
    "jobs",
    "knowledge_documents",
    "knowledge_entries",
    "knowledge_folders",
    "knowledge_imported_items",
    "knowledge_indices",
    "knowledge_order_mutations",
    "knowledge_source_restores",
    "knowledge_snapshot_index_receipts",
    "local_model_selection",
    "opportunity_schedule_web",
    "opportunity_search_snapshots",
    "opportunity_suggestion_reviews_web",
    "opportunity_suggestion_settings",
    "paa_alerts",
    "paa_watch_generations",
    "paa_watches",
    "project_deletion_receipts",
    "project_deletion_objects",
    "project_plan_assets",
    "project_secop",
    "projects",
    "provider_credentials",
    "rejection_finding_removals",
    "runner_pairings",
    "runners",
    "rup_certificates",
    "rup_current",
    "secop_watch_alerts_web",
    "secop_watch_baselines_web",
    "secop_zip_commits",
    "technical_batch_applications",
    "technical_batch_consistency",
    "technical_batch_consistency_ledger",
    "technical_batch_drafts",
    "technical_batch_plans",
    "technical_batch_word_adjustments",
    "technical_batch_word_plans"
  ],
  "project": [
    "project_feasibility_reports",
    "project_feasibility_sources",
    "project_feasibility_source_selections",
    "project_feasibility_extracted_texts",
    "project_feasibility_extracted_images",
    "project_addendum_history",
    "secop_import_selection",
    "economic_offer_drafts",
    "project_blind_profiles",
    "project_file_deletions",
    "project_files",
    "project_web_upload_receipts",
    "project_global_facts",
    "project_automatic_preparation",
    "project_outline_applications",
    "project_outline_root_selections",
    "project_requirements",
    "project_secop_files",
    "project_selected_templates",
    "project_tasks",
    "project_technical_analyses",
    "project_technical_plan_nodes",
    "project_technical_plans",
    "project_template_values",
    "project_workflow",
    "project_opportunity_tracking",
    "project_offer_documents",
    "project_offer_document_receipts",
    "project_offer_support_links",
    "project_offer_support_link_receipts",
    "project_offer_package_items",
    "project_offer_package_receipts",
    "project_requirement_supports",
    "project_submission_requests",
    "project_submission_results",
    "project_submission_attachments",
    "project_submission_records",
    "project_submission_evidence",
    "project_submission_evidence_repairs",
    "rejection_drafts",
    "requirement_suggestion_acceptances",
    "rup_requirement_comparisons",
    "secop_zip_files"
  ],
  "job": [
    "job_activity",
    "word_recoveries",
    "word_field_reviews",
    "bid_evaluation_web_reviews",
    "job_artifacts",
    "job_repair_reports",
    "secop_zip_parts"
  ],
  "accountJob": [
    "account_job_artifacts"
  ],
  "certificate": [
    "rup_reviewed_facts"
  ],
  "global": [
    "tenants",
    "secop_search_cache",
    "placsp_tenders",
    "placsp_sync_state",
    "runner_config_items"
  ],
  "tenant": ["tenant_members"],
  "auth": [
    "auth_superadmin_bootstrap",
    "account",
    "rateLimit",
    "session",
    "twoFactor",
    "user",
    "verification"
  ]
};
const objectTables=new Set([
  "project_feasibility_sources",
  "project_feasibility_extracted_texts",
  "project_feasibility_extracted_images",
  "word_recoveries",
  "account_job_artifacts",
  "company_certificate_image_deletions",
  "company_certificate_images",
  "company_experience_image_deletions",
  "company_experience_images",
  "company_profile_image_deletions",
  "company_profile_images",
  "desktop_feasibility_sources",
  "desktop_file_staging",
  "desktop_plan_file_imports",
  "feasibility_assets",
  "feasibility_snapshot_imports",
  "feasibility_snapshot_objects",
  "feasibility_extracted_images",
  "feasibility_extracted_texts",
  "feasibility_web_sources",
  "image_library_restores",
  "image_library_web",
  "imported_duplicate_check_files",
  "imported_duplicate_checks",
  "imported_rup_comparisons",
  "job_artifacts",
  "job_repair_reports",
  "knowledge_documents",
  "knowledge_source_restores",
  "project_deletion_objects",
  "project_file_deletions",
  "project_files",
  "project_plan_assets",
  "project_submission_attachments",
  "project_submission_evidence",
  "rup_certificates"
]);
const excluded=new Set(['project_automatic_preparation','secop_search_cache','placsp_tenders','placsp_sync_state','auth_superadmin_bootstrap','account','rateLimit','session','twoFactor','verification','runner_pairings','runners']);
const sensitive=new Set(['provider_credentials']);
export const backupTables=Object.freeze(Object.fromEntries(
 Object.entries(scopes).flatMap(([scope,names])=>names.map(name=>[name,Object.freeze({scope,disposition:excluded.has(name)?'exclude':sensitive.has(name)?'sensitive':'review',objectColumns:Object.freeze(objectTables.has(name)?['object_key']:[])})]))
));

// This audit inspects schema metadata only; it never reads customer records.
export function inspectBackupCoverage(db){
 const issues=[];
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
 const actual=new Set(names);
 for(const name of names){
  const entry=backupTables[name];
  if(!entry){issues.push({type:'unclassified_table',table:name});continue;}
  const quoted=name.replaceAll('"','""');
  const columns=db.prepare(`PRAGMA table_info("${quoted}")`).all().map(row=>row.name);
  const columnSet=new Set(columns);
  const required={owner:'owner_id',project:'project_id',job:'job_id',accountJob:'job_id',certificate:'certificate_id',tenant:'tenant_id'}[entry.scope];
  if(required&&!columnSet.has(required))issues.push({type:'missing_scope_column',table:name,column:required});
  for(const column of columns.filter(value=>/(?:^|_)object_key$/.test(value))){
   if(!entry.objectColumns.includes(column))issues.push({type:'unclassified_object_column',table:name,column});
  }
  for(const column of entry.objectColumns){
   if(!columnSet.has(column))issues.push({type:'missing_object_column',table:name,column});
  }
  if(['project','job','accountJob','certificate','tenant'].includes(entry.scope)){
   const target={project:'projects',job:'jobs',accountJob:'account_jobs',certificate:'rup_certificates',tenant:'tenants'}[entry.scope];
   const relations=db.prepare(`PRAGMA foreign_key_list("${quoted}")`).all();
   if(!relations.some(item=>item.from===required&&item.table===target))issues.push({type:'missing_scope_relation',table:name,column:required});
  }
 }
 for(const name of Object.keys(backupTables))if(!actual.has(name))issues.push({type:'missing_table',table:name});
 return issues;
}
