CREATE TABLE desktop_plan_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 project_id TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY (owner_id, request_id)
);
