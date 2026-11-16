CREATE TABLE project_workflow (project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE, stage TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE project_tasks (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, due_date TEXT NOT NULL, completed INTEGER NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX project_tasks_project ON project_tasks(project_id, created_at);
CREATE TABLE project_requirements (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, source TEXT NOT NULL, evidence TEXT NOT NULL, status TEXT NOT NULL, category TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX project_requirements_project ON project_requirements(project_id, created_at);
