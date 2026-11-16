CREATE TABLE desktop_submission_tracking_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('requests','results')),
 source_hash TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 item_id TEXT NOT NULL,
 source_task_id TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id,kind,source_hash),
 FOREIGN KEY(owner_id,request_id) REFERENCES desktop_plan_imports(owner_id,request_id) ON DELETE CASCADE
);
