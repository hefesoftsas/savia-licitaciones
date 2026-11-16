ALTER TABLE imported_duplicate_checks ADD COLUMN review_type TEXT NOT NULL DEFAULT 'duplicate';
CREATE INDEX imported_reviews_by_type ON imported_duplicate_checks(owner_id,review_type,created_at);
