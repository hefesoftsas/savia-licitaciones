CREATE TABLE company_profile_images (
 id TEXT PRIMARY KEY,
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
CREATE INDEX company_profile_images_owner ON company_profile_images(owner_id,field_key,sort_order);
CREATE TABLE company_profile_image_deletions (
 id TEXT PRIMARY KEY,
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
