CREATE TABLE knowledge_indices (
 document_id TEXT PRIMARY KEY REFERENCES knowledge_documents(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 job_id TEXT NOT NULL,
 mutation_id TEXT NOT NULL
);
CREATE TABLE knowledge_entries (
 id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 title TEXT NOT NULL,
 summary TEXT NOT NULL,
 quote TEXT NOT NULL,
 sort_order INTEGER NOT NULL
);
CREATE INDEX knowledge_entries_owner ON knowledge_entries(owner_id, document_id, sort_order);
