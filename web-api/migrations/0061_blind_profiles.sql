CREATE TABLE project_blind_profiles (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 profile_json TEXT NOT NULL,
 version INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);
