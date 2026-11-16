ALTER TABLE desktop_requirement_support_imports ADD COLUMN archive_hash TEXT;
CREATE TABLE desktop_support_certificate_map (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 support_id TEXT NOT NULL REFERENCES project_requirement_supports(id) ON DELETE CASCADE,
 source_id TEXT NOT NULL,
 source_hash TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id,support_id),
 FOREIGN KEY(owner_id,request_id) REFERENCES desktop_requirement_support_imports(owner_id,request_id) ON DELETE CASCADE
);
