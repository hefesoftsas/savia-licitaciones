CREATE TABLE desktop_blind_task_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 job_id TEXT NOT NULL REFERENCES jobs(id) DEFERRABLE INITIALLY DEFERRED,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id,source_key)
);
