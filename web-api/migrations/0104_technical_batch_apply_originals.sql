ALTER TABLE technical_batch_applications ADD COLUMN originals_only INTEGER NOT NULL DEFAULT 0 CHECK (originals_only IN (0,1));
