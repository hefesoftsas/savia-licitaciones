ALTER TABLE "user" ADD COLUMN savia_theme TEXT NOT NULL DEFAULT 'system' CHECK (savia_theme IN ('light', 'dark', 'system'));
