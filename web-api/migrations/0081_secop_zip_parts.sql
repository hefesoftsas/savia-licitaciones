CREATE TABLE secop_zip_parts (
 job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 part_index INTEGER NOT NULL,
 staging_id TEXT NOT NULL UNIQUE REFERENCES desktop_file_staging(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 sha256 TEXT NOT NULL,
 PRIMARY KEY(job_id, part_index)
);
CREATE TABLE secop_zip_commits (
 job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 document_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 part_count INTEGER NOT NULL,
 skipped INTEGER NOT NULL,
 mutation_id TEXT NOT NULL
);
CREATE TABLE secop_zip_files (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 document_id TEXT NOT NULL,
 file_id TEXT NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
 PRIMARY KEY(project_id, document_id, file_id)
);
