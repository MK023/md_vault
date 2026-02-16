# Uncomment after creating the S3 bucket and DynamoDB table:
#
# terraform {
#   backend "s3" {
#     bucket         = "md-vault-terraform-state"
#     key            = "terraform.tfstate"
#     region         = "eu-south-1"
#     dynamodb_table = "md-vault-terraform-lock"
#     encrypt        = true
#   }
# }

# Run these commands first to create the backend resources:
# aws s3api create-bucket --bucket md-vault-terraform-state --region eu-south-1 --create-bucket-configuration LocationConstraint=eu-south-1
# aws dynamodb create-table --table-name md-vault-terraform-lock --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST --region eu-south-1
