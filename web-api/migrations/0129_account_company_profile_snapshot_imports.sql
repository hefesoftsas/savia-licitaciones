CREATE TABLE account_company_profile_snapshot_imports (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE account_company_profile_snapshot_image_imports (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 image_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id,source_key)
);
