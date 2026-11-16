CREATE TABLE project_technical_analyses_new (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  job_id TEXT REFERENCES jobs(id),
  review_id TEXT,
  source_file_ids_json TEXT,
  source_snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((job_id IS NOT NULL AND review_id IS NULL AND source_file_ids_json IS NULL) OR (job_id IS NULL AND review_id IS NOT NULL AND source_file_ids_json IS NOT NULL)),
  PRIMARY KEY(project_id, category)
);
INSERT INTO project_technical_analyses_new (project_id, category, revision, content, job_id, source_snapshot_json, updated_at)
SELECT project_id, category, revision, content, job_id, source_snapshot_json, updated_at FROM project_technical_analyses;
DROP TABLE project_technical_analyses;
ALTER TABLE project_technical_analyses_new RENAME TO project_technical_analyses;
