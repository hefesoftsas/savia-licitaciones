CREATE TABLE desktop_knowledge_folder_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 folder_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id, request_id, source_key)
);
CREATE TABLE desktop_knowledge_document_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 document_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id, request_id, source_key)
);
CREATE TABLE knowledge_imported_items (
 document_id TEXT PRIMARY KEY REFERENCES knowledge_documents(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 items_json TEXT NOT NULL
);
