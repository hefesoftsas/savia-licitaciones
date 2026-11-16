CREATE TABLE tenants (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  owner_user_id TEXT UNIQUE REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE TABLE tenant_members (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);
INSERT INTO tenants (id, name, owner_user_id, created_at)
SELECT 'legacy:' || id, name, id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM "user";
INSERT INTO tenant_members (tenant_id, user_id, created_at)
SELECT 'legacy:' || id, id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM "user";
