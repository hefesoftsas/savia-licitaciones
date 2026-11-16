CREATE TABLE knowledge_folders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX knowledge_folders_owner ON knowledge_folders(owner_id, created_at);
CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES knowledge_folders(id),
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleting INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX knowledge_documents_owner_folder ON knowledge_documents(owner_id, folder_id, created_at);
