CREATE TABLE rejection_drafts (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 criteria TEXT NOT NULL,
 custom TEXT NOT NULL,
 options_json TEXT NOT NULL,
 version INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);
