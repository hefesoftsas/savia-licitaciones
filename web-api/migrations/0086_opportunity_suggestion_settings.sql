CREATE TABLE opportunity_suggestion_settings (
 owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL,
 keywords TEXT NOT NULL,
 version INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);
