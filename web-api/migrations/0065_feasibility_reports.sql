CREATE TABLE feasibility_reports (
  owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
