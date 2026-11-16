CREATE TABLE technical_batch_applications (
 job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 source_version INTEGER NOT NULL,
 applied_version INTEGER NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
