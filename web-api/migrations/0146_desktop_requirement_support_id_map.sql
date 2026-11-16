CREATE TABLE desktop_requirement_support_id_map (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 source_id TEXT NOT NULL,
 support_id TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id,source_id),
 FOREIGN KEY(owner_id,request_id) REFERENCES desktop_requirement_support_imports(owner_id,request_id) ON DELETE CASCADE
);
CREATE INDEX desktop_requirement_support_map_project ON desktop_requirement_support_id_map(project_id,source_id);
