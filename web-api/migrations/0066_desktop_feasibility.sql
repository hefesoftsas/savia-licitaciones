CREATE TABLE desktop_feasibility_imports (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE desktop_feasibility_sources (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 expected INTEGER NOT NULL,
 object_key TEXT,
 content_hash TEXT,
 deleting INTEGER NOT NULL DEFAULT 0,
 deleted INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner_id,source_key),
 FOREIGN KEY(owner_id,request_id) REFERENCES desktop_feasibility_imports(owner_id,request_id) ON DELETE CASCADE
);
