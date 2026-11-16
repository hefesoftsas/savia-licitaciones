ALTER TABLE opportunity_suggestion_settings ADD COLUMN credential_id TEXT;
ALTER TABLE opportunity_suggestion_settings ADD COLUMN include_rup INTEGER NOT NULL DEFAULT 0;
ALTER TABLE opportunity_suggestion_settings ADD COLUMN consented_at TEXT;
