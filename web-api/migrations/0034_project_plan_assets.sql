CREATE TABLE project_plan_assets (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 reference TEXT NOT NULL,
 kind TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 content_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE (owner_id, request_id, source_key)
);
