CREATE TABLE project_feasibility_extracted_texts (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 job_id TEXT NOT NULL REFERENCES account_jobs(id) ON DELETE CASCADE,
 source_key TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, content_hash TEXT NOT NULL,
 size INTEGER NOT NULL, created_at TEXT NOT NULL, image_count INTEGER NOT NULL DEFAULT 0,
 UNIQUE(job_id,source_key)
);
CREATE INDEX project_feasibility_text_lookup ON project_feasibility_extracted_texts(project_id,owner_id,source_key);
CREATE TABLE project_feasibility_extracted_images (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 job_id TEXT NOT NULL REFERENCES account_jobs(id) ON DELETE CASCADE,
 source_key TEXT NOT NULL, content_hash TEXT NOT NULL, content_type TEXT NOT NULL,
 size INTEGER NOT NULL, object_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
 UNIQUE(job_id,source_key,content_hash)
);
CREATE INDEX project_feasibility_image_lookup ON project_feasibility_extracted_images(project_id,owner_id,source_key);
