CREATE TABLE project_file_deletions (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 size INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 deleted_at TEXT NOT NULL,
 storage_deleted_at TEXT
);
CREATE INDEX project_file_deletions_pending ON project_file_deletions(project_id, storage_deleted_at);
