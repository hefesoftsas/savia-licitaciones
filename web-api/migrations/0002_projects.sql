CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, title TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX projects_owner_idx ON projects (owner_id, created_at);
CREATE TABLE project_files (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE, name TEXT NOT NULL, content_type TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, size INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX project_files_project_idx ON project_files (project_id, created_at);
