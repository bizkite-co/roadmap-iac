#!/bin/bash

# Script to get the logs for the E2E test runner lambda

STACK_NAME="RoadmapE2ETestStack"
LAMBDA_LOGICAL_ID="E2ETestRunnerLambda"

# Find the function name by looking for a function that contains the stack name and logical ID
# This is a bit brittle, but it's the best we can do without parsing the full CloudFormation template
FUNCTION_NAME=$(aws lambda list-functions --query "Functions[?contains(FunctionName, '$STACK_NAME-$LAMBDA_LOGICAL_ID')].FunctionName" --output text)

if [ -z "$FUNCTION_NAME" ]; then
  echo "Could not find Lambda function for stack $STACK_NAME and logical ID $LAMBDA_LOGICAL_ID."
  echo "Please ensure the stack is deployed and the function name is correctly identified."
  exit 1
fi

LOG_GROUP_NAME="/aws/lambda/${FUNCTION_NAME}"

echo "Fetching logs for log group: ${LOG_GROUP_NAME}"
echo "This will show the most recent log streams and their output."

# Get the most recent log stream
LOG_STREAM_NAME=$(aws logs describe-log-streams --log-group-name "${LOG_GROUP_NAME}" --order-by LastEventTime --descending --limit 1 --query 'logStreams[0].logStreamName' --output text)

if [ "$LOG_STREAM_NAME" == "None" ] || [ -z "$LOG_STREAM_NAME" ]; then
  echo "No log streams found for the log group. The lambda might not have run yet."
  exit 0
fi

echo "Most recent log stream: ${LOG_STREAM_NAME}"

# Get the log events from the most recent log stream
aws logs get-log-events \
  --log-group-name "${LOG_GROUP_NAME}" \
  --log-stream-name "${LOG_STREAM_NAME}" \
  --query 'events[*].message' --output text |
  sed -E -e 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z/\x1b[32m&\x1b[0m/' \
    -e 's/(ERROR|SEVERE|FAIL)/\x1b[31m&\x1b[0m/g'
