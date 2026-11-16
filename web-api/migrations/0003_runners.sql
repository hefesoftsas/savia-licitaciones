CREATE TABLE runner_pairings (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, code_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE INDEX runner_pairings_owner_idx ON runner_pairings (owner_id);
CREATE TABLE runners (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_seen_at TEXT, revoked_at TEXT);
CREATE INDEX runners_owner_idx ON runners (owner_id, created_at);
