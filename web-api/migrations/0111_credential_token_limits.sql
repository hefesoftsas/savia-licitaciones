ALTER TABLE provider_credentials ADD COLUMN context_tokens INTEGER NOT NULL DEFAULT 400000;
ALTER TABLE provider_credentials ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 16384;
