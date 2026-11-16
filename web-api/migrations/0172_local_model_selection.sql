CREATE TABLE local_model_selection (
 owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 model TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
