#!/bin/bash

set -euo pipefail

# Get the directory of the script
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
PROJECT_ROOT=$(dirname "$SCRIPT_DIR")

# Read secretName from cdk.json
SECRET_NAME=$(jq -r '.context.secretName' "${PROJECT_ROOT}/cdk.json")

if [ -z "$SECRET_NAME" ]; then
  echo "Error: secretName not found in cdk.json context."
  exit 1
fi

# Fetch password from 1Password
# The 'op run' command is used here to ensure the 1Password CLI is authenticated
# and can retrieve the secret. It will prompt for sign-in if not already authenticated.
echo "Fetching password from 1Password..."
# Fetch password from 1Password
echo "Fetching password from 1Password..."

# Create a temporary .env file for op run
ENV_FILE=$(mktemp)
echo "OP_E2E_PASSWORD=op://Private/Roadmappartners/password" > "$ENV_FILE"

# Use op run with the temporary .env file to get the password
PASSWORD=$(op run --env-file="$ENV_FILE" -- printenv OP_E2E_PASSWORD)

# Clean up the temporary .env file
rm "$ENV_FILE"


if [ -z "$PASSWORD" ]; then
  echo "Error: Failed to retrieve password from 1Password. Ensure 'op' is signed in and the item exists."
  exit 1
fi

# Check if the secret already exists in AWS Secrets Manager
SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --query 'ARN' --output text 2>/dev/null || true)"

if [ -z "$SECRET_ARN" ]; then
  echo "Secret '$SECRET_NAME' does not exist. Creating..."
  aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --description "E2E test credentials for Roadmap application" \
    --secret-string "$PASSWORD"
  echo "Secret '$SECRET_NAME' created successfully."
else
  echo "Secret '$SECRET_NAME' already exists. Updating value..."
  aws secretsmanager update-secret \
    --secret-id "$SECRET_NAME" \
    --secret-string "$PASSWORD"
  echo "Secret '$SECRET_NAME' updated successfully."
fi

echo "AWS Secrets Manager secret '$SECRET_NAME' is ready."
