CREATE TABLE paa_watches (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 plan_id TEXT NOT NULL,
 header_json TEXT NOT NULL,
 checked_at TEXT NOT NULL,
 error TEXT NOT NULL,
 revision INTEGER NOT NULL,
 mutation_token TEXT NOT NULL,
 UNIQUE(owner_id, plan_id)
);
CREATE TABLE paa_watch_generations (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 plan_id TEXT NOT NULL,
 generation INTEGER NOT NULL,
 PRIMARY KEY(owner_id,plan_id)
);
CREATE TABLE paa_alerts (
 id TEXT PRIMARY KEY NOT NULL,
 watch_id TEXT NOT NULL REFERENCES paa_watches(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 previous_json TEXT NOT NULL,
 current_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 reviewed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX paa_alerts_owner ON paa_alerts(owner_id, created_at);
