variable "account_id" {
  description = "Cloudflare account ID."
  type        = string
}
variable "database_name" {
  description = "Name of the D1 database for this environment."
  type        = string
}
variable "bucket_name" {
  description = "Name of the R2 bucket for this environment."
  type        = string
}
variable "worker_name" {
  description = "Name used by Wrangler to publish the web Worker."
  type        = string
}
variable "site_url" {
  description = "Public HTTPS origin for Better Auth."
  type        = string
  validation {
    condition     = can(regex("^https://[^/]+$", var.site_url))
    error_message = "site_url must be an HTTPS origin without a path or trailing slash."
  }
}
variable "email_from" {
  description = "Sender address enabled in Cloudflare Email Service."
  type        = string
}
variable "credential_key_id" {
  description = "Identifier of the credential encryption key, not the key itself."
  type        = string
}
variable "enable_custom_domain" {
  description = "Attach the domain after the Worker is first published."
  type        = bool
  default     = false
}
variable "zone_id" {
  description = "Zone ID for the optional custom domain."
  type        = string
  default     = ""
}
variable "hostname" {
  description = "Hostname for the optional custom domain."
  type        = string
  default     = ""
}
variable "runner_download_windows_url" {
  description = "HTTPS download URL for the Windows connector installer."
  type        = string
  default     = ""
}
variable "runner_download_macos_x64_url" {
  description = "HTTPS download URL for the macOS Intel connector installer."
  type        = string
  default     = ""
}
variable "runner_download_macos_arm64_url" {
  description = "HTTPS download URL for the macOS Apple Silicon connector installer."
  type        = string
  default     = ""
}
variable "runner_download_linux_arm64_url" {
  description = "HTTPS download URL for the Linux ARM64 connector installer."
  type        = string
  default     = ""
}
