CREATE TABLE project_technical_analyses (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  source_snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, category)
);
