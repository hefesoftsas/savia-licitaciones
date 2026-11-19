CREATE TABLE project_automatic_preparation (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','blocked','ready')),
  reason TEXT,
  batch_id TEXT,
  word_id TEXT,
  lock_id TEXT,
  lock_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX automatic_preparation_owner_status ON project_automatic_preparation(owner_id,status,updated_at);
