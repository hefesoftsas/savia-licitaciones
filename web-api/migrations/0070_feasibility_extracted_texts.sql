CREATE TABLE feasibility_extracted_texts (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 job_id TEXT NOT NULL REFERENCES account_jobs(id) ON DELETE CASCADE, source_key TEXT NOT NULL,
 object_key TEXT NOT NULL, content_hash TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(job_id,source_key)
);
