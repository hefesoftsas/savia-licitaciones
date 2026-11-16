output "d1_database_id" {
  description = "D1 database identifier."
  value       = cloudflare_d1_database.web.id
}
output "r2_bucket_name" {
  description = "R2 bucket used by the web application."
  value       = cloudflare_r2_bucket.files.name
}
output "wrangler_config" {
  description = "Wrangler configuration; save as web-api/wrangler.web.generated.json after apply."
  value       = local.wrangler_config
}
