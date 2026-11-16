terraform {
  required_version = ">= 1.8.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28.0"
    }
  }
}

provider "cloudflare" {}

resource "cloudflare_d1_database" "web" {
  account_id = var.account_id
  name       = var.database_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_bucket" "files" {
  account_id = var.account_id
  name       = var.bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

# Create the Worker with Wrangler first; attach the optional domain afterwards.
resource "cloudflare_workers_custom_domain" "web" {
  count      = var.enable_custom_domain ? 1 : 0
  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = var.hostname
  service    = var.worker_name

  lifecycle {
    precondition {
      condition     = var.zone_id != "" && var.hostname != "" && var.site_url == "https://${var.hostname}"
      error_message = "Set zone_id and hostname, and make site_url match the custom domain."
    }
  }
}

# Keep the Worker bindings, Durable Object migration and assets in one source.
locals {
  wrangler_template = jsondecode(file("${path.module}/../../web-api/wrangler.web.template.jsonc"))
  wrangler_config = merge(local.wrangler_template, {
    name       = var.worker_name
    account_id = var.account_id
    r2_buckets = [{ binding = "FILES", bucket_name = cloudflare_r2_bucket.files.name }]
    d1_databases = [{
      binding        = "DB"
      database_name  = cloudflare_d1_database.web.name
      database_id    = cloudflare_d1_database.web.id
      migrations_dir = "migrations"
    }]
    vars = merge(local.wrangler_template.vars, {
      BETTER_AUTH_URL                 = var.site_url
      AUTH_EMAIL_FROM                 = var.email_from
      CREDENTIAL_KEY_ID               = var.credential_key_id
      RUNNER_DOWNLOAD_WINDOWS_URL     = var.runner_download_windows_url
      RUNNER_DOWNLOAD_MACOS_X64_URL   = var.runner_download_macos_x64_url
      RUNNER_DOWNLOAD_MACOS_ARM64_URL = var.runner_download_macos_arm64_url
      RUNNER_DOWNLOAD_LINUX_ARM64_URL = var.runner_download_linux_arm64_url
    })
    send_email = [{ name = "EMAIL", allowed_sender_addresses = [var.email_from] }]
  })
}
