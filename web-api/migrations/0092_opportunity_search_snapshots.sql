CREATE TABLE opportunity_search_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  settings_version INTEGER NOT NULL,
  credential_id TEXT NOT NULL REFERENCES provider_credentials(id),
  source_fingerprint TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  shortlist_json TEXT NOT NULL,
  candidates_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX opportunity_search_snapshots_owner ON opportunity_search_snapshots(owner_id, expires_at);
CREATE UNIQUE INDEX opportunity_search_one_active ON account_jobs(owner_id) WHERE kind='opportunity.analyze' AND state IN ('queued','running');
