CREATE TABLE project_web_upload_receipts (
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, project_id, request_key)
);
