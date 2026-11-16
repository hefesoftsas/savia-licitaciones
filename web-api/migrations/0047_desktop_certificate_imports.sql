CREATE TABLE desktop_certificate_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 certificate_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id, request_id, source_key)
);
