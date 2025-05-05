#!/bin/bash

# Function to validate a cron expression using date
validate_cron() {
  cron="$1"
  # Extract minutes and hours from the cron expression
  minutes=$(echo "$cron" | awk -F'[()]' '{print $2}' | awk -F' ' '{print $1}')
  hours=$(echo "$cron" | awk -F'[()]' '{print $2}' | awk -F' ' '{print $2}')

  # Attempt to parse the cron expression using date
  date -d "+$minutes minutes +$hours hours" > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "Error: Invalid cron expression '$cron'"
    return 1
  fi

  return 0
}

# Load the stack config
uat_config=$(jq '.uat' stack.config.json)

# Validate the autoStopSchedule
autoStopSchedule=$(jq -r '.autoStopSchedule' <<< "$uat_config")
if ! validate_cron "$autoStopSchedule"; then
  echo "Error: Invalid autoStopSchedule cron expression."
  exit 1
fi

# Validate the e2eTestSchedule cron expressions
e2eTestSchedule=$(jq -r '.e2eTestSchedule[]' <<< "$uat_config")
while IFS= read -r cron; do
  if ! validate_cron "$cron"; then
    echo "Error: Invalid e2eTestSchedule cron expression: $cron"
    exit 1
  fi
done <<< "$e2eTestSchedule"

echo "Cron expressions validated successfully."
exit 0