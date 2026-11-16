CREATE TABLE project_feasibility_sources (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 source_key TEXT NOT NULL, upload_key TEXT NOT NULL, name TEXT NOT NULL,
 content_type TEXT NOT NULL, content_hash TEXT NOT NULL, size INTEGER NOT NULL,
 object_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
 deleting INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(project_id,source_key), UNIQUE(project_id,upload_key)
);
CREATE INDEX project_feasibility_sources_owner ON project_feasibility_sources(owner_id,project_id);
