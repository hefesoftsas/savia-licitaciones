-- Project reports are separate from the legacy account-wide report.
CREATE TABLE project_feasibility_reports (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX project_feasibility_reports_owner ON project_feasibility_reports(owner_id);
