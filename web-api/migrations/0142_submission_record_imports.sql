CREATE TABLE desktop_submission_record_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 source_hash TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 submission_id TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id,source_hash),
 FOREIGN KEY(owner_id,request_id) REFERENCES desktop_plan_imports(owner_id,request_id) ON DELETE CASCADE
);
