CREATE TABLE provider_credentials (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, provider TEXT NOT NULL, model TEXT NOT NULL, key_id TEXT NOT NULL, iv TEXT NOT NULL, ciphertext TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE INDEX provider_credentials_owner_idx ON provider_credentials (owner_id, created_at);
ALTER TABLE jobs ADD COLUMN credential_id TEXT REFERENCES provider_credentials (id);
