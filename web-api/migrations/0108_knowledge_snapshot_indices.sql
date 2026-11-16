CREATE TABLE knowledge_snapshot_index_receipts (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 document_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 mapping_json TEXT NOT NULL,
 PRIMARY KEY (owner_id, request_id, source_key)
);
