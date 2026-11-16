CREATE TABLE project_submission_evidence_repairs (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 submission_id TEXT NOT NULL REFERENCES project_submission_records(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('package','receipt')),
 source_file_id TEXT NOT NULL,
 evidence_id TEXT NOT NULL,
 PRIMARY KEY(submission_id,role)
);
