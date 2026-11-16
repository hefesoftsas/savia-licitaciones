CREATE TABLE export_format_templates (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 format_json TEXT NOT NULL,
 version INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX export_format_templates_owner ON export_format_templates(owner_id,updated_at);
CREATE TABLE desktop_export_template_imports (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 template_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id,source_key)
);
