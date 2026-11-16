CREATE TABLE job_repair_reports (
 id TEXT PRIMARY KEY NOT NULL,
 job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE,
 sha256 TEXT NOT NULL,
 size INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 deleted_at TEXT,
 storage_deleted_at TEXT
);
