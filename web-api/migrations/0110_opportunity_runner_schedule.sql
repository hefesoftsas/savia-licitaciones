ALTER TABLE opportunity_suggestion_settings ADD COLUMN runner_auto_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE opportunity_suggestion_settings ADD COLUMN runner_language TEXT NOT NULL DEFAULT 'es';
