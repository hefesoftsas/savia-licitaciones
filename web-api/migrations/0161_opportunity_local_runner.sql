ALTER TABLE opportunity_suggestion_settings ADD COLUMN local_runner INTEGER NOT NULL DEFAULT 0;
CREATE TABLE opportunity_search_snapshots_local (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 settings_version INTEGER NOT NULL,
 credential_id TEXT REFERENCES provider_credentials(id),
 source_fingerprint TEXT NOT NULL,
 profile_json TEXT NOT NULL,
 shortlist_json TEXT NOT NULL,
 candidates_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 source_state TEXT
);
INSERT INTO opportunity_search_snapshots_local SELECT id,owner_id,settings_version,credential_id,source_fingerprint,profile_json,shortlist_json,candidates_json,created_at,expires_at,source_state FROM opportunity_search_snapshots;
DROP TABLE opportunity_search_snapshots;
ALTER TABLE opportunity_search_snapshots_local RENAME TO opportunity_search_snapshots;
CREATE INDEX opportunity_search_snapshots_owner ON opportunity_search_snapshots(owner_id, expires_at);
