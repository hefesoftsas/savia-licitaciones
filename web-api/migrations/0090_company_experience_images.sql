ALTER TABLE company_experience_projects ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0;
CREATE TABLE company_experience_images (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES company_experience_projects(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 custom_name TEXT NOT NULL DEFAULT '',
 field_key TEXT NOT NULL,
 content_type TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 size INTEGER NOT NULL,
 sort_order INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX company_experience_images_owner ON company_experience_images(owner_id,project_id,field_key,sort_order);
CREATE TABLE company_experience_image_deletions (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 field_key TEXT NOT NULL,
 content_type TEXT NOT NULL,
 object_key TEXT NOT NULL,
 size INTEGER NOT NULL,
 sort_order INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 storage_deleted_at TEXT
);
