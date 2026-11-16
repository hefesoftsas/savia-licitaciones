CREATE TABLE project_submission_requests (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('observation','correction')),
 title TEXT NOT NULL,
 due_date TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('pending','reviewed','resolved')),
 task_id TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX project_submission_requests_project ON project_submission_requests(project_id,created_at,id);
CREATE TABLE project_submission_results (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 result TEXT NOT NULL CHECK(result IN ('awarded','not_awarded','other')),
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX project_submission_results_project ON project_submission_results(project_id,created_at,id);
