CREATE TABLE project_selection (
  owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);
