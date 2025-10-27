#!/bin/bash

# Script to list the E2E test schedules

# Function to display rule details
display_rule_details() {
    local rule_name=$1
    local rule_type=$2

    RULE_DETAILS=$(aws events describe-rule --name "$rule_name" 2>/dev/null)

    if [ -z "$RULE_DETAILS" ]; then
        echo "$rule_type schedule ($rule_name) not found. Please deploy the latest changes."
    else
        SCHEDULE_EXPRESSION=$(echo "$RULE_DETAILS" | jq -r .ScheduleExpression)
        STATE=$(echo "$RULE_DETAILS" | jq -r .State)

        # Extract minute and hour from cron expression
        MINUTE=$(echo "$SCHEDULE_EXPRESSION" | sed -E 's/cron\((\S+)\s+(\S+)\s+.*$/\1/')
        HOUR=$(echo "$SCHEDULE_EXPRESSION" | sed -E 's/cron\((\S+)\s+(\S+)\s+.*$/\2/')

        # Get current date in UTC
        CURRENT_DATE_UTC=$(date -u +%Y-%m-%d)

        # Combine to form a UTC datetime string for conversion
        DATETIME_UTC="$CURRENT_DATE_UTC $HOUR:$MINUTE UTC"

        # Convert to local time, including seconds for clarity
        LOCAL_DATETIME=$(date -d "$DATETIME_UTC" "+%H:%M:%S %Z")

        echo "---------------------------------"
        echo "Rule Name:      $rule_name"
        echo "Schedule (UTC): $SCHEDULE_EXPRESSION"
        echo "Schedule (Local): $LOCAL_DATETIME"
        echo "State:          $STATE"
    fi
}

# Display regular schedule
display_rule_details "roadmap-e2e-regular-schedule" "Regular"

# Display debug schedule
display_rule_details "roadmap-e2e-debug-schedule" "Debug"