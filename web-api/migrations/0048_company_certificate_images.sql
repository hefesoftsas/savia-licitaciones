ALTER TABLE company_certificates ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0;
CREATE TABLE company_certificate_images (
 id TEXT PRIMARY KEY NOT NULL,
 certificate_id TEXT NOT NULL REFERENCES company_certificates(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 object_key TEXT NOT NULL,
 size INTEGER NOT NULL,
 sort_order INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX company_certificate_images_owner ON company_certificate_images(owner_id, certificate_id, sort_order);
CREATE TABLE company_certificate_image_deletions (
 id TEXT PRIMARY KEY NOT NULL,
 certificate_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 object_key TEXT NOT NULL,
 name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 sort_order INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 storage_deleted_at TEXT
);
CREATE INDEX company_certificate_image_cleanup ON company_certificate_image_deletions(owner_id, certificate_id, storage_deleted_at);
