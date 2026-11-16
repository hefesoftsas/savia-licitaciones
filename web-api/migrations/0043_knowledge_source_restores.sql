CREATE TABLE knowledge_source_restores (
 document_id TEXT PRIMARY KEY REFERENCES knowledge_documents(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 content_hash TEXT NOT NULL,
 file_name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
