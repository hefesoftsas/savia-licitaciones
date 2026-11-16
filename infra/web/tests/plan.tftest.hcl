mock_provider "cloudflare" {
  mock_resource "cloudflare_d1_database" {
    defaults = { id = "00000000-0000-0000-0000-000000000001" }
  }
}

variables {
  account_id        = "00000000000000000000000000000000"
  database_name     = "savia-test"
  bucket_name       = "savia-test-files"
  worker_name       = "savia-test"
  site_url          = "https://savia.example.com"
  email_from        = "savia@example.com"
  credential_key_id = "key-1"
}

run "initial_plan" {
  command = plan

  assert {
    condition     = length(cloudflare_workers_custom_domain.web) == 0
    error_message = "The domain must remain disabled until the Worker has been published."
  }
  assert {
    condition     = output.wrangler_config.durable_objects.bindings[0].name == "PREVIEW_WAKE" && output.wrangler_config.migrations[0].tag == "preview-wake-v1"
    error_message = "The generated Worker configuration must retain the preview Durable Object."
  }
  assert {
    condition     = output.wrangler_config.durable_objects.bindings[1].name == "BACKUP_GATE" && output.wrangler_config.migrations[1].tag == "backup-gate-v1" && output.wrangler_config.vars.BACKUP_GATE_ENABLED == "true"
    error_message = "The generated Worker configuration must enable the backup request gate."
  }
  assert {
    condition     = output.wrangler_config.d1_databases[0].binding == "DB" && output.wrangler_config.r2_buckets[0].binding == "FILES"
    error_message = "The Worker must use the managed D1 and R2 bindings."
  }
  assert {
    condition     = !contains(keys(output.wrangler_config), "ai") && !contains(keys(output.wrangler_config.vars), "BETTER_AUTH_SECRET") && !contains(keys(output.wrangler_config.vars), "CREDENTIAL_KEY_HEX")
    error_message = "AI bindings and secrets must not be emitted in the Worker configuration."
  }
}

run "domain_plan" {
  command = plan
  variables {
    enable_custom_domain = true
    zone_id              = "11111111111111111111111111111111"
    hostname             = "savia.example.com"
  }
  assert {
    condition     = length(cloudflare_workers_custom_domain.web) == 1 && cloudflare_workers_custom_domain.web[0].service == "savia-test"
    error_message = "The optional domain must target the correct Worker."
  }
}

run "reject_mismatched_domain" {
  command = plan
  variables {
    enable_custom_domain = true
    zone_id              = "11111111111111111111111111111111"
    hostname             = "other.example.com"
  }
  expect_failures = [cloudflare_workers_custom_domain.web]
}
