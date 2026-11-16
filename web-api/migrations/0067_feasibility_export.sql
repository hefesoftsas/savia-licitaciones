DROP INDEX account_jobs_claim;
ALTER TABLE account_jobs RENAME TO account_jobs_previous;
CREATE TABLE account_jobs (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, kind TEXT NOT NULL, client_request_id TEXT NOT NULL, payload_json TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, runner_id TEXT REFERENCES runners(id), lease_hash TEXT, lease_expires_at INTEGER, result_json TEXT, credential_id TEXT REFERENCES provider_credentials(id), UNIQUE(owner_id, client_request_id));
INSERT INTO account_jobs SELECT * FROM account_jobs_previous;
DROP TABLE account_jobs_previous;
CREATE INDEX account_jobs_claim ON account_jobs(owner_id,state,created_at);
CREATE TABLE account_job_artifacts (id TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES account_jobs(id) ON DELETE CASCADE, object_key TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT, storage_deleted_at TEXT);
