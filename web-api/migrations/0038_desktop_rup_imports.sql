CREATE TABLE desktop_rup_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 certificate_id TEXT NOT NULL REFERENCES rup_certificates(id),
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id, request_id)
);
