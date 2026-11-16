CREATE TABLE project_offer_documents (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 source_kind TEXT NOT NULL,
 file_id TEXT REFERENCES project_files(id) ON DELETE SET NULL,
 missing_reason TEXT,
 created_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX project_offer_documents_project ON project_offer_documents(project_id,id);
CREATE TABLE project_offer_support_links (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 document_id TEXT REFERENCES project_offer_documents(id) ON DELETE SET NULL,
 requirement_id TEXT REFERENCES project_requirements(id) ON DELETE SET NULL,
 support_id TEXT REFERENCES project_requirement_supports(id) ON DELETE SET NULL,
 source_document_id TEXT NOT NULL,
 source_requirement_id TEXT NOT NULL,
 source_support_id TEXT NOT NULL
);
CREATE INDEX project_offer_support_links_project ON project_offer_support_links(project_id,id);
CREATE TABLE project_offer_package_items (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 document_id TEXT REFERENCES project_offer_documents(id) ON DELETE SET NULL,
 source_document_id TEXT NOT NULL,
 sort_order INTEGER NOT NULL,
 expected_size INTEGER NOT NULL,
 expected_digest TEXT NOT NULL,
 state TEXT NOT NULL,
 review_required INTEGER NOT NULL,
 UNIQUE(project_id,sort_order)
);
CREATE TABLE desktop_offer_document_imports (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id),
 FOREIGN KEY(owner_id,request_id) REFERENCES desktop_plan_imports(owner_id,request_id) ON DELETE CASCADE
);
