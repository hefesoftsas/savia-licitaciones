ALTER TABLE project_submission_requests ADD COLUMN client_key TEXT;
ALTER TABLE project_submission_requests ADD COLUMN payload_hash TEXT;
CREATE UNIQUE INDEX project_submission_requests_key ON project_submission_requests(project_id,client_key) WHERE client_key IS NOT NULL;
ALTER TABLE project_submission_results ADD COLUMN client_key TEXT;
ALTER TABLE project_submission_results ADD COLUMN payload_hash TEXT;
CREATE UNIQUE INDEX project_submission_results_key ON project_submission_results(project_id,client_key) WHERE client_key IS NOT NULL;
