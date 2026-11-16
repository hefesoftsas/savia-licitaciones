ALTER TABLE runners ADD COLUMN max_agents INTEGER NOT NULL DEFAULT 1 CHECK(max_agents BETWEEN 1 AND 4);
ALTER TABLE runners ADD COLUMN supports_concurrency INTEGER NOT NULL DEFAULT 0 CHECK(supports_concurrency IN (0,1));
