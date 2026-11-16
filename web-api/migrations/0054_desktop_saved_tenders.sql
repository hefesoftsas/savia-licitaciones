CREATE TABLE desktop_saved_tender_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 source_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 record_json TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id),
 UNIQUE(project_id)
);
CREATE INDEX desktop_saved_tender_source ON desktop_saved_tender_imports(owner_id,source_id);
