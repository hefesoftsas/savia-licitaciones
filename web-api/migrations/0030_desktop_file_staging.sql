CREATE TABLE desktop_file_staging (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL,
 lease_until INTEGER NOT NULL,
 writer_done INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE INDEX desktop_file_staging_owner ON desktop_file_staging(owner_id, state, lease_until);
