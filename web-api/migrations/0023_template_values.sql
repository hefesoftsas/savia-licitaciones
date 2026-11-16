CREATE TABLE project_template_values (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  revision INTEGER NOT NULL,
  values_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, job_id)
);
