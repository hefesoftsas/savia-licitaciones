CREATE TABLE opportunity_suggestion_reviews_web (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 source TEXT NOT NULL,
 process_id TEXT NOT NULL,
 reviewed_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,source,process_id)
);
