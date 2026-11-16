CREATE TABLE company_experience_projects (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 details_json TEXT NOT NULL,
 version INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX company_experience_owner ON company_experience_projects(owner_id,updated_at,created_at);
