#!/bin/bash

# Set the environment to prod
environment="prod"

# Load the stack config
stack_config=$(cat stack.config.json)

# Extract the instance ID and region from the stack config
instance_id=$(echo "$stack_config" | jq -r ".\"$environment\".instanceId")
region=$(echo "$stack_config" | jq -r ".\"$environment\".region")

# Check if the instance ID and region are defined
if [ -z "$instance_id" ] || [ -z "$region" ]; then
  echo "Error: Instance ID or region not found for environment ${environment}."
  exit 1
fi

# Get the current time
current_time=$(date +%H:%M)

# Calculate the stop time (1 minute in the future)
stop_minute=$(date -d "$current_time + 1 minute" +%M)
stop_hour=$(date -d "$current_time + 1 minute" +%H)

# Set the schedule in cron-list.json
rule_name="AutoStartStopEc2Stack-e2eTestRule1B9F6E07B-uDQD6fY9tnNz"
schedule_expression="cron($stop_minute $stop_hour ? * MON-FRI *)"

echo "Setting schedule for rule $rule_name to $schedule_expression..."
aws events put-rule \
    --name "$rule_name" \
    --schedule-expression "$schedule_expression" \
    --region "$region"

# Wait for the stop time
echo "Waiting for stop time (1 minute)..."
sleep 60

# Check the EC2 instance status
echo "Checking EC2 instance status..."
ec2_status=$(aws ec2 describe-instances --instance-ids "$instance_id" --region "$region" | jq -r ".Reservations[0].Instances[0].State.Name")
echo "EC2 instance status: $ec2_status"

# Check if the website is running
echo "Checking if the website is running..."
if curl -s https://roadmappartners.net/roadmap/login.html | grep -q "Login"; then
  echo "Website is running."
else
  echo "Website is not running."

  # Start the website
  echo "Starting the website..."
  npm run start:prod

  # Wait for the website to start
  echo "Waiting 60 seconds for the website to start..."
  sleep 60

  # Check if the website is running
  echo "Checking if the website is running..."
  if curl -s https://roadmappartners.net/roadmap/login.html | grep -q "Login"; then
    echo "Website is running."
  else
    echo "Website is still not running."
    exit 1
  fi
fi

echo "Test complete."