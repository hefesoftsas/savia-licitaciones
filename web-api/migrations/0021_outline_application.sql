ALTER TABLE project_technical_plan_nodes ADD COLUMN attr TEXT;
CREATE TABLE project_outline_applications (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  plan_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, job_id)
);
