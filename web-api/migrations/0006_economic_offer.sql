CREATE TABLE economic_offer_drafts (project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE, draft_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL);
