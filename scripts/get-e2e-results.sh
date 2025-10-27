#!/bin/bash

# Script to get the last 3 E2E test results

# The bucket name is derived from the CDK stack outputs.
# It's constructed as {prefix}-{account}-{region}
# From the last synth, we know the bucket name is:
BUCKET_NAME="roadmap-website-e2e-865664998993-us-west-1"
INDEX_FILE="reports-index.json"

echo "Fetching E2E test results from s3://${BUCKET_NAME}/${INDEX_FILE}"

# Download the index file from S3, and use jq to parse and display the results.
# This command will fail gracefully if the file does not exist yet.
aws s3 cp "s3://${BUCKET_NAME}/${INDEX_FILE}" - 2>/dev/null | jq -r '.[:3] | .[] | "\(.timestamp) - \(.status) - \(.reportUrl)"'

if [ $? -ne 0 ]; then
    echo "Could not retrieve or parse test results. The S3 object might not exist yet."
fi
