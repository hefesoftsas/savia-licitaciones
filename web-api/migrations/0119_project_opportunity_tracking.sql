CREATE TABLE project_opportunity_tracking (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  owner TEXT NOT NULL,
  notes TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
