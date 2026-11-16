CREATE TABLE job_activity (
 job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL,
 code TEXT NOT NULL,
 occurred_at TEXT NOT NULL,
 PRIMARY KEY (job_id,sequence)
);
