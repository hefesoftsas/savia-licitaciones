CREATE TABLE company_profiles (
 owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 profile_json TEXT NOT NULL,
 version INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);
