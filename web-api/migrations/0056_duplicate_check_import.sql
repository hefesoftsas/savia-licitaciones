CREATE TABLE imported_duplicate_checks (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 object_key TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(owner_id,request_id)
);
CREATE INDEX imported_duplicate_checks_owner ON imported_duplicate_checks(owner_id,created_at);
CREATE TABLE imported_duplicate_check_files (
 review_id TEXT NOT NULL REFERENCES imported_duplicate_checks(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 kind TEXT NOT NULL,
 object_key TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 PRIMARY KEY(review_id,source_key,kind)
);
