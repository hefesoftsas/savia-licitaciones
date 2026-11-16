CREATE TABLE project_selected_templates (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  revision INTEGER NOT NULL,
  source_snapshot_json TEXT NOT NULL,
  chapter_fingerprint TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
