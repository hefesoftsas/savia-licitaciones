CREATE TABLE runner_poll_preferences (
 owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 interval_seconds INTEGER NOT NULL DEFAULT 10 CHECK(interval_seconds BETWEEN 10 AND 300)
);
