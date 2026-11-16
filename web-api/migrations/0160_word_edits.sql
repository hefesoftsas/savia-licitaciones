ALTER TABLE job_artifacts ADD COLUMN edit_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_artifacts ADD COLUMN edited_at TEXT;
