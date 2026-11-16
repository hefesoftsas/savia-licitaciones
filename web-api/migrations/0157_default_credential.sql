CREATE TABLE account_model_selection (
 owner_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 credential_id TEXT REFERENCES provider_credentials(id) ON DELETE SET NULL
);
