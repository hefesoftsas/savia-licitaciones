ALTER TABLE account_jobs ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX account_jobs_project ON account_jobs(owner_id,project_id,kind,state);
