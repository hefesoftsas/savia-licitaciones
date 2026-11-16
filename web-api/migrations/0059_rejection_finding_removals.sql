CREATE TABLE rejection_finding_removals (
 job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 section TEXT NOT NULL,
 finding_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(job_id,section,finding_id)
);
