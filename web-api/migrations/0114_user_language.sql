ALTER TABLE "user" ADD COLUMN savia_language TEXT NOT NULL DEFAULT 'es' CHECK (savia_language IN ('es', 'en'));
