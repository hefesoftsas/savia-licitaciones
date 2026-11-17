CREATE TABLE placsp_tenders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  modality TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  status_code TEXT NOT NULL DEFAULT '',
  value REAL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  publication_date TEXT NOT NULL DEFAULT '',
  deadline TEXT NOT NULL DEFAULT '',
  territory TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  classification_code TEXT NOT NULL DEFAULT '',
  cpv_codes_json TEXT NOT NULL DEFAULT '[]',
  url TEXT NOT NULL DEFAULT '',
  documents_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT '',
  synced_at INTEGER NOT NULL
);
CREATE INDEX placsp_tenders_pub ON placsp_tenders(publication_date DESC, id);
CREATE INDEX placsp_tenders_status ON placsp_tenders(status_code, territory);
CREATE INDEX placsp_tenders_cpv ON placsp_tenders(classification_code);

CREATE TABLE placsp_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_synced_at INTEGER NOT NULL DEFAULT 0,
  last_feed_updated TEXT NOT NULL DEFAULT '',
  entry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO placsp_sync_state (id) VALUES (1);
