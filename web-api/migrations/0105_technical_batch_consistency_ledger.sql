CREATE TABLE technical_batch_consistency_ledger (
 job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 node_id TEXT NOT NULL,
 entry_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(job_id,node_id)
);
