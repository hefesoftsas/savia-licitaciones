CREATE TABLE project_offer_support_link_receipts (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL,
 payload TEXT NOT NULL,
 link_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,project_id,request_key)
);
