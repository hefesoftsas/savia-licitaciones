CREATE TABLE project_submission_attachments (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL REFERENCES project_submission_requests(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL,
 name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 sha256 TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 UNIQUE(project_id,request_id,request_key)
);
CREATE INDEX project_submission_attachments_request ON project_submission_attachments(project_id,request_id,created_at,id);
