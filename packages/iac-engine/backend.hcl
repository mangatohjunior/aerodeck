# Non-secret S3-compatible backend config for DigitalOcean Spaces.
# Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in CI.
# The state *key* is passed at init time so each environment has its own file:
#   terraform init -backend-config=backend.hcl \
#     -backend-config="key=${ENV}/platform/terraform.tfstate"

bucket = "aerodeck-tfstate"

# Required by the s3 backend; Spaces ignores it.
region = "us-east-1"

endpoints = {
  s3 = "https://nyc3.digitaloceanspaces.com"
}

skip_credentials_validation = true
skip_requesting_account_id  = true
skip_metadata_api_check     = true
skip_region_validation      = true
skip_s3_checksum            = true
use_path_style              = false
