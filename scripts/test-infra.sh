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

# Start the EC2 instance
echo "Starting EC2 instance ${instance_id} in region ${region}..."
aws ec2 start-instances --instance-ids "$instance_id" --region "$region"

# Wait for the EC2 instance to be running
echo "Waiting for EC2 instance ${instance_id} to be running..."
aws ec2 wait instance-running --instance-ids "$instance_id" --region "$region"

# Add a delay to allow the Tomcat server to start
echo "Waiting 120 seconds for the Tomcat server to start..."
sleep 120

# Start Tomcat on the EC2 instance using SSM
echo "Starting Tomcat on EC2 instance ${instance_id} using SSM..."
aws ssm send-command \
    --instance-ids "$instance_id" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=sudo /opt/tomcat/apache-tomcat-9.0.53/bin/startup.sh" \
    --region "$region" \
    --output text

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
  exit 1
fi

echo "Test complete."