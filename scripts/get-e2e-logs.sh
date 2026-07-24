#!/bin/bash

# Script to get the logs for the E2E test runner lambda

STACK_NAME="RoadmapE2ETestStack"
LAMBDA_LOGICAL_ID="E2ETestRunnerLambda"

# Find the function name by looking for a function that contains the stack name and logical ID
# This is a bit brittle, but it's the best we can do without parsing the full CloudFormation template
FUNCTION_NAME="roadmap-prod-e2e-test-runner-lambda"

if [ -z "$FUNCTION_NAME" ]; then
  echo "Could not find Lambda function for stack $STACK_NAME and logical ID $LAMBDA_LOGICAL_ID."
  echo "Please ensure the stack is deployed and the function name is correctly identified."
  exit 1
fi

LOG_GROUP_NAME="roadmap-prod-e2e-test-runner-lambda-log-group"

echo "Fetching logs for log group: ${LOG_GROUP_NAME} (last hour)"

# Get log events from the last hour
aws logs filter-log-events \
  --log-group-name "${LOG_GROUP_NAME}" \
  --start-time $(($(date +%s) - 3600))000 \
  --query 'events[*].message' --output text |
  sed -E -e 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z/\x1b[32m&\x1b[0m/' \
    -e 's/(ERROR|SEVERE|FAIL)/\x1b[31m&\x1b[0m/g'
