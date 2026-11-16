CREATE TABLE secop_watch_baselines_web (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 process_json TEXT NOT NULL,
 documents_json TEXT,
 checked_at TEXT NOT NULL,
 error TEXT NOT NULL,
 revision INTEGER NOT NULL,
 mutation_token TEXT NOT NULL
);
CREATE TABLE secop_watch_alerts_web (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 title TEXT NOT NULL,
 kind TEXT NOT NULL,
 previous_json TEXT,
 current_json TEXT,
 created_at TEXT NOT NULL,
 reviewed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX secop_watch_alerts_web_owner ON secop_watch_alerts_web(owner_id,project_id,created_at);
