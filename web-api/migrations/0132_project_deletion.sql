CREATE TABLE project_deletion_receipts (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL,
 title TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,project_id)
);
CREATE TABLE project_deletion_objects (
 owner_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 object_key TEXT NOT NULL,
 attempted_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner_id,project_id,object_key),
 FOREIGN KEY(owner_id,project_id) REFERENCES project_deletion_receipts(owner_id,project_id) ON DELETE CASCADE
);
