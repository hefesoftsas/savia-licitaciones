CREATE TABLE "rateLimit" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "lastRequest" INTEGER NOT NULL
);
CREATE INDEX "rateLimit_lastRequest_idx" ON "rateLimit" ("lastRequest");
