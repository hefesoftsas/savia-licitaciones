CREATE TABLE agenda_layout_preferences (owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, layout_json TEXT NOT NULL);
