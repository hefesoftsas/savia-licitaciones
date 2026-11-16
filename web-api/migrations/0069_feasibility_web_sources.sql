CREATE TABLE feasibility_web_sources (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 source_key TEXT NOT NULL, upload_key TEXT NOT NULL, name TEXT NOT NULL, content_type TEXT NOT NULL,
 content_hash TEXT NOT NULL, size INTEGER NOT NULL, object_key TEXT NOT NULL, mutation_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,source_key), UNIQUE(owner_id,upload_key)
);
CREATE TABLE feasibility_source_selections (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, content_hash TEXT NOT NULL, mutation_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id)
);
