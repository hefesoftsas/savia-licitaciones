CREATE TABLE feasibility_snapshot_imports (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('preparing','committing','committed','discarding')),
 mutation_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE feasibility_snapshot_objects (
 owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 source_id TEXT NOT NULL,
 target_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 content_hash TEXT NOT NULL,
 size INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,request_id,kind,source_id),
 FOREIGN KEY(owner_id,request_id) REFERENCES feasibility_snapshot_imports(owner_id,request_id) ON DELETE CASCADE
);
CREATE TABLE feasibility_snapshot_job_aliases (
 owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 original_job_id TEXT NOT NULL,
 job_id TEXT NOT NULL REFERENCES account_jobs(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 PRIMARY KEY(owner_id,original_job_id),
 FOREIGN KEY(owner_id,request_id) REFERENCES feasibility_snapshot_imports(owner_id,request_id) ON DELETE CASCADE
);
