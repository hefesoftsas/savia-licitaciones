ALTER TABLE "user" ADD COLUMN savia_preferences_revision INTEGER NOT NULL DEFAULT 0 CHECK (savia_preferences_revision >= 0);
