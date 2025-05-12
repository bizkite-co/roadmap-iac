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
delay=60
echo "Waiting $delay seconds for the Tomcat server to start..."
sleep $delay

# Start Tomcat on the EC2 instance using SSM
echo "Starting Tomcat on EC2 instance ${instance_id} using SSM..."
aws ssm send-command \
    --instance-ids "$instance_id" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=sudo /opt/tomcat/apache-tomcat-9.0.53/bin/startup.sh" \
    --region "$region" \
    --output text

# Tail the Tomcat logs using SSM
echo "Tailing Tomcat logs on EC2 instance ${instance_id} using SSM..."
ssm_command_output=$(aws ssm send-command \
    --instance-ids "$instance_id" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=sudo tail -n 2000 /opt/tomcat/apache-tomcat-9.0.53/logs/catalina.out" \
    --region "$region" \
    --output json)

ssm_command_id=$(echo "$ssm_command_output" | jq -r '.Command.CommandId')

# Wait for command to complete and get output
command_status=""
while [[ "$command_status" != "Success" && "$command_status" != "Failed" && "$command_status" != "Cancelled" && "$command_status" != "TimedOut" ]]; do
  sleep 5
  command_invocation_output=$(aws ssm get-command-invocation \
      --command-id "$ssm_command_id" \
      --instance-id "$instance_id" \
      --region "$region" \
      --output json)
  command_status=$(echo "$command_invocation_output" | jq -r '.Status')
done

if [ "$command_status" != "Success" ]; then
  echo "Error: SSM command to get logs failed with status $command_status."
  exit 1
fi

tomcat_logs=$(echo "$command_invocation_output" | jq -r '.StandardOutputContent')

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
