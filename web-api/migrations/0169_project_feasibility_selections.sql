CREATE TABLE project_feasibility_source_selections (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, content_hash TEXT NOT NULL, mutation_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(project_id,request_id)
);
CREATE INDEX project_feasibility_selections_owner ON project_feasibility_source_selections(owner_id,project_id);
