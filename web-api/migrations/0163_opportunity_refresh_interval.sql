ALTER TABLE opportunity_suggestion_settings ADD COLUMN refresh_hours INTEGER NOT NULL DEFAULT 6 CHECK(refresh_hours IN (6, 12, 24, 48, 168));
UPDATE opportunity_suggestion_settings SET runner_auto_enabled=1 WHERE enabled=1 AND auto_enabled=1;
