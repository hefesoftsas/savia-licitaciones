CREATE TABLE word_field_reviews (
 job_id TEXT PRIMARY KEY NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 state_json TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
