CREATE TABLE imported_rup_comparisons (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 source_requirement_id TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 object_key TEXT UNIQUE,
 missing_reason TEXT,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(owner_id, request_id, source_key)
);
CREATE INDEX imported_rup_comparisons_project ON imported_rup_comparisons(project_id, created_at, id);
