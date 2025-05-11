#!/bin/bash

# Check if the environment is specified
if [ -z "$1" ]; then
  echo "Error: Please specify the environment (prod or uat)."
  exit 1
fi

# Set the environment
environment="$1"

# Check if the environment is valid
if [ "$environment" != "prod" ] && [ "$environment" != "uat" ]; then
  echo "Error: Invalid environment. Please specify prod or uat."
  exit 1
fi

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

# Check the EC2 instance status
echo "Checking EC2 instance ${instance_id} status in region ${region}..."
instance_status=$(aws ec2 describe-instances --instance-ids "$instance_id" --region "$region" --query "Reservations[0].Instances[0].State.Name" --output text)
echo "EC2 instance ${instance_id} status: ${instance_status}"

# Add a delay to allow the Tomcat server to start
echo "Waiting 120 seconds for the Tomcat server to start..."
sleep 120

# Tail the Tomcat logs using SSH and grep for errors
echo "Tailing Tomcat logs on EC2 instance ${instance_id} using SSH and grepping for errors..."
tomcat_logs=$(ssh ubuntu@184.72.30.45 sudo tail -n 2000 /opt/tomcat/apache-tomcat-9.0.53/logs/catalina.out)

# Check for errors in the Tomcat logs
if echo "$tomcat_logs" | grep -q "ERROR"; then
  echo "Errors found in Tomcat logs:"
  echo "$tomcat_logs" | grep ERROR | tail -n 10
else
  echo "No errors found in Tomcat logs."
fi

# Check if the website is running
echo "Checking if the website is running..."
if curl -s https://roadmappartners.net/roadmap/login.html | grep -q "Login"; then
  echo "Website is running."
else
  echo "Website is not running."
  echo "Curl output:"
  echo "$curl_output"
fi

echo "EC2 instance ${instance_id} status checked successfully."