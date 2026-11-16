ALTER TABLE runners ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'local' CHECK (execution_mode IN ('local','hosted'));
