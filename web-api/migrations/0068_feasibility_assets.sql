CREATE TABLE feasibility_assets (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, source_key TEXT NOT NULL, kind TEXT NOT NULL, reference TEXT NOT NULL,
 content_type TEXT NOT NULL, content_hash TEXT NOT NULL, size INTEGER NOT NULL, object_key TEXT NOT NULL,
 mutation_id TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(owner_id,source_key), FOREIGN KEY(owner_id,request_id) REFERENCES desktop_feasibility_imports(owner_id,request_id) ON DELETE CASCADE
);
