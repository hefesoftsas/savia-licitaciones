DELETE FROM "rateLimit" WHERE length("key") != 64 OR "key" GLOB '*[^0-9a-f]*';
