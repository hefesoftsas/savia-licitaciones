CREATE TABLE job_questions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  lease_hash TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  question_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'answered')),
  response_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id, tool_call_id)
);
CREATE UNIQUE INDEX job_questions_one_pending ON job_questions(job_id) WHERE state = 'pending';
