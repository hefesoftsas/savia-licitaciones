CREATE TABLE IF NOT EXISTS runner_config_items (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('skill', 'hook', 'prompt')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_path TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runner_config_items_category ON runner_config_items(category);
