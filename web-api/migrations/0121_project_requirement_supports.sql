CREATE TABLE project_requirement_supports (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 requirement_id TEXT NOT NULL REFERENCES project_requirements(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 status TEXT NOT NULL,
 link_type TEXT NOT NULL,
 link_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX project_requirement_supports_requirement ON project_requirement_supports(project_id,requirement_id,created_at,id);
