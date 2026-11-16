CREATE TABLE rup_certificates (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, name TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, pages INTEGER NOT NULL, imported_at TEXT NOT NULL, issued_on TEXT NOT NULL DEFAULT '');
CREATE INDEX rup_certificates_owner ON rup_certificates(owner_id);
CREATE TABLE rup_current (owner_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, certificate_id TEXT, version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE rup_reviewed_facts (id TEXT PRIMARY KEY NOT NULL, certificate_id TEXT NOT NULL REFERENCES rup_certificates(id) ON DELETE CASCADE, label TEXT NOT NULL, value TEXT NOT NULL, page INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX rup_facts_certificate ON rup_reviewed_facts(certificate_id);
