CREATE TABLE bid_evaluation_web_reviews (
 job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 criterion_id TEXT NOT NULL,
 status TEXT NOT NULL,
 score REAL,
 note TEXT NOT NULL,
 version INTEGER NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY (job_id,criterion_id)
);
