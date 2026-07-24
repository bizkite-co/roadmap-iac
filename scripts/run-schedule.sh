#!/bin/bash

# Script to update the debug schedule to run in the next minute

RULE_NAME="roadmap-prod-e2e-test-debug-schedule"

export AWS_REGION="us-west-1" # Explicitly set the AWS region

# Get current schedule
aws events describe-rule --name "$RULE_NAME" > /dev/null 2>&1
EXIT_CODE=$?
echo "aws events describe-rule exit code: $EXIT_CODE"
if [ $EXIT_CODE -ne 0 ]; then
    echo "Debug schedule not found. Please deploy the latest changes."
    exit 1
fi
CURRENT_SCHEDULE_EXPRESSION=$(aws events describe-rule --name "$RULE_NAME" --query "ScheduleExpression" --output text)

# Extract minute and hour from current cron expression
CURRENT_MINUTE=$(echo "$CURRENT_SCHEDULE_EXPRESSION" | sed -E 's/cron\((\S+)\s+(\S+)\s+.*$/\1/')
CURRENT_HOUR=$(echo "$CURRENT_SCHEDULE_EXPRESSION" | sed -E 's/cron\((\S+)\s+(\S+)\s+.*$/\2/')

# Get current date in UTC
CURRENT_DATE_UTC=$(date -u +%Y-%m-%d)

# Combine to form a UTC datetime string for conversion
CURRENT_DATETIME_UTC="$CURRENT_DATE_UTC $CURRENT_HOUR:$CURRENT_MINUTE UTC"

# Convert to local time, including seconds for clarity
CURRENT_LOCAL_DATETIME=$(date -d "$CURRENT_DATETIME_UTC" "+%H:%M:%S %Z")

echo "Current schedule (UTC): $CURRENT_SCHEDULE_EXPRESSION"
echo "Current schedule (Local): $CURRENT_LOCAL_DATETIME"


# Calculate new schedule for 90 seconds in the future
# Note: EventBridge cron expressions are in UTC.
NEW_CRON_MINUTE=$(date -u -d '+90 seconds' +%M)
NEW_CRON_HOUR=$(date -u -d '+90 seconds' +%H)
NEW_CRON_DAY=$(date -u -d '+90 seconds' +%d)
NEW_CRON_MONTH=$(date -u -d '+90 seconds' +%m)
NEW_CRON_YEAR=$(date -u -d '+90 seconds' +%Y)

NEW_SCHEDULE_EXPRESSION="cron($NEW_CRON_MINUTE $NEW_CRON_HOUR $NEW_CRON_DAY $NEW_CRON_MONTH ? $NEW_CRON_YEAR)"

# Update the rule and enable it
aws events put-rule --name "$RULE_NAME" --schedule-expression "$NEW_SCHEDULE_EXPRESSION" > /dev/null
aws events enable-rule --name "$RULE_NAME"

# Extract minute and hour from new cron expression
NEW_MINUTE=$(echo "$NEW_SCHEDULE_EXPRESSION" | sed -E 's/cron\((\S+)\s+(\S+)\s+.*$/\1/')
NEW_HOUR=$(echo "$NEW_SCHEDULE_EXPRESSION" | sed -E 's/cron\((\S+)\s+(\S+)\s+.*$/\2/')

# Combine to form a UTC datetime string for conversion
NEW_DATETIME_UTC="$CURRENT_DATE_UTC $NEW_HOUR:$NEW_MINUTE UTC"

# Convert to local time, including seconds for clarity
NEW_LOCAL_DATETIME=$(date -d "$NEW_DATETIME_UTC" "+%H:%M:%S %Z")


echo "Schedule updated to (UTC): $NEW_SCHEDULE_EXPRESSION"
echo "Schedule updated to (Local): $NEW_LOCAL_DATETIME"
echo "The job should run in approximately 90 seconds."