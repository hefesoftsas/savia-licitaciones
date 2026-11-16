CREATE TABLE word_recoveries (
 job_id TEXT PRIMARY KEY NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 base_revision INTEGER NOT NULL,
 revision TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
