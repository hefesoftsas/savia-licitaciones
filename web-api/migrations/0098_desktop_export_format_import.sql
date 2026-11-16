CREATE TABLE desktop_export_format_imports (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id)
);
