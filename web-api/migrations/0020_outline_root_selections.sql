CREATE TABLE project_outline_root_selections (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  items_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
