ALTER TABLE opportunity_suggestion_settings ADD COLUMN auto_enabled INTEGER NOT NULL DEFAULT 0;
CREATE TABLE opportunity_schedule_web (
 owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 last_attempt INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0
);
