CREATE TABLE feasibility_outline_applications (
 job_id TEXT PRIMARY KEY REFERENCES account_jobs(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 source_version INTEGER NOT NULL, applied_version INTEGER NOT NULL, mutation_id TEXT NOT NULL, created_at TEXT NOT NULL
);
