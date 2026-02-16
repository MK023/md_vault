# Uncomment after creating the GCS bucket:
#
# terraform {
#   backend "gcs" {
#     bucket = "md-vault-terraform-state"
#     prefix = "terraform/state"
#   }
# }

# Run this command first to create the backend bucket:
# gcloud storage buckets create gs://md-vault-terraform-state --project=mdvault --location=europe-west8 --uniform-bucket-level-access
