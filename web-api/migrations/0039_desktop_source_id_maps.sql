CREATE TABLE desktop_requirement_id_map (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 source_id TEXT NOT NULL,
 requirement_id TEXT NOT NULL,
 PRIMARY KEY(owner_id, request_id, source_id),
 FOREIGN KEY(owner_id, request_id) REFERENCES desktop_workflow_imports(owner_id, request_id) ON DELETE CASCADE
);
CREATE INDEX desktop_requirement_map_project ON desktop_requirement_id_map(project_id, source_id);
CREATE TABLE desktop_rup_fact_id_map (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 certificate_id TEXT NOT NULL REFERENCES rup_certificates(id),
 source_id TEXT NOT NULL,
 fact_id TEXT NOT NULL,
 PRIMARY KEY(owner_id, request_id, source_id),
 FOREIGN KEY(owner_id, request_id) REFERENCES desktop_rup_imports(owner_id, request_id) ON DELETE CASCADE
);
CREATE INDEX desktop_rup_map_certificate ON desktop_rup_fact_id_map(certificate_id, source_id);
