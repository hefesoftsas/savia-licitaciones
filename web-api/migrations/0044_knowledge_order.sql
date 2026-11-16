ALTER TABLE knowledge_folders ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge_documents ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE knowledge_folders SET sort_order = (SELECT position FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY created_at, id) - 1 AS position FROM knowledge_folders) ranked WHERE ranked.id = knowledge_folders.id);
UPDATE knowledge_documents SET sort_order = (SELECT position FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY owner_id, folder_id ORDER BY created_at DESC, id) - 1 AS position FROM knowledge_documents) ranked WHERE ranked.id = knowledge_documents.id);
CREATE TABLE knowledge_order_mutations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, scope TEXT NOT NULL);
CREATE INDEX knowledge_folder_order ON knowledge_folders(owner_id, sort_order, created_at, id);
CREATE INDEX knowledge_document_order ON knowledge_documents(owner_id, folder_id, sort_order, created_at DESC, id);
