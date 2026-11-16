ALTER TABLE imported_duplicate_checks ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0;
ALTER TABLE imported_duplicate_checks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
