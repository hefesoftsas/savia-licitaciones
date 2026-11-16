CREATE TABLE image_library_web (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 object_key TEXT,
 size INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 sequence INTEGER NOT NULL,
 missing_reason TEXT,
 deleting INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX image_library_web_owner ON image_library_web(owner_id,created_at,sequence);
CREATE TABLE desktop_image_library_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 image_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id,source_key)
);
CREATE TABLE image_library_restores (
 image_id TEXT PRIMARY KEY REFERENCES image_library_web(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 object_key TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
