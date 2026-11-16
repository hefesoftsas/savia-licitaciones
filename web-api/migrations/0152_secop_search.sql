CREATE TABLE secop_search_preferences (owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, preferences_json TEXT NOT NULL);
CREATE TABLE secop_search_cache (cache_key TEXT PRIMARY KEY, response_json TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX secop_search_cache_expiry ON secop_search_cache(expires_at);
