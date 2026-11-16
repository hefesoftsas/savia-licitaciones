CREATE TABLE project_offer_package_receipts (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL,
 document_id TEXT NOT NULL,
 document_version INTEGER NOT NULL,
 item_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,project_id,request_key)
);
