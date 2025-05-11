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

# Start the EC2 instance
echo "Starting EC2 instance ${instance_id} in region ${region}..."
aws ec2 start-instances --instance-ids "$instance_id" --region "$region"

# Wait for the EC2 instance to be running
echo "Waiting for EC2 instance ${instance_id} to be running..."
aws ec2 wait instance-running --instance-ids "$instance_id" --region "$region"

# Add a delay to allow the instance to be fully accessible
echo "Waiting 60 seconds for the instance to be fully accessible..."
sleep 60

# Start Tomcat on the EC2 instance using SSM
echo "Starting Tomcat on EC2 instance ${instance_id} using SSM..."
aws ssm send-command \
    --instance-ids "$instance_id" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=sudo /opt/tomcat/apache-tomcat-9.0.53/bin/startup.sh" \
    --region "$region" \
    --output text

echo "EC2 instance ${instance_id} started successfully."