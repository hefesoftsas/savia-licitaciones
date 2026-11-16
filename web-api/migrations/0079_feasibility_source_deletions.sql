ALTER TABLE feasibility_web_sources ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feasibility_web_sources ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
CREATE TABLE feasibility_web_source_deletions (owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, source_key TEXT NOT NULL, source_version INTEGER NOT NULL, applied_version INTEGER NOT NULL, mutation_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(owner_id,source_key));
