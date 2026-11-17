ALTER TABLE "user" ADD COLUMN savia_market TEXT NOT NULL DEFAULT 'ALL' CHECK (savia_market IN ('CO', 'ES', 'ALL'));
