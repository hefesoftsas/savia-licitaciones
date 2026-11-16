CREATE TABLE desktop_secop_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 source TEXT NOT NULL,
 external_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id),
 UNIQUE(project_id)
);
