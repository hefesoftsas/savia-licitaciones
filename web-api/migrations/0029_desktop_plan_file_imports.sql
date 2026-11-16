CREATE TABLE desktop_plan_file_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 file_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 object_key TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY (owner_id, request_id, source_key)
);
