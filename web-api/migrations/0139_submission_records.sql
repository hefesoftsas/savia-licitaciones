CREATE TABLE project_submission_records (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 submitted_on TEXT NOT NULL,
 reference TEXT NOT NULL,
 version TEXT NOT NULL,
 note TEXT NOT NULL,
 request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(project_id,request_key)
);
CREATE TABLE project_submission_evidence (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 submission_id TEXT NOT NULL REFERENCES project_submission_records(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('package','receipt')),
 name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 sha256 TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 UNIQUE(submission_id,role)
);
CREATE INDEX project_submission_records_project ON project_submission_records(project_id,created_at,id);
CREATE INDEX project_submission_evidence_project ON project_submission_evidence(project_id,submission_id);
