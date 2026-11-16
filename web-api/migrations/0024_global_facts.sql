CREATE TABLE project_global_facts (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  groups_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  source_job_id TEXT REFERENCES jobs(id),
  updated_at TEXT NOT NULL
);
