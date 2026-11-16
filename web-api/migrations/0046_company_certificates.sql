CREATE TABLE company_certificates (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 number TEXT NOT NULL,
 validity_mode TEXT NOT NULL,
 valid_from TEXT NOT NULL,
 valid_to TEXT NOT NULL,
 version INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX company_certificates_owner ON company_certificates(owner_id, updated_at);
