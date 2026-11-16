CREATE TABLE export_format_settings (
 owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 format_json TEXT NOT NULL,
 version INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);
