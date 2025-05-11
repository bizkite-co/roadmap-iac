export $(cat .env | xargs)

# Run this script on your EC2 instance to test CloudWatch agent and SSM agent.

# This script assumes you have the following installed:
# - SSM agent
# - SSM CLI
# - CloudWatch agent
# - AWS CLI, 
#   - Configured with --region

### .env file should look like this with comment # and leading space removed.
# region="us-west-1"
# log_group_name="your-log-group-name"
###

status=$(sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status)
if [[ $status == *"running"* ]]; then
  echo "CloudWatch agent is running"
else
  echo "CloudWatch agent is not running"
  exit 1
fi

sudo ssm-cli get-diagnostics --output table

# Get instance ID for log stream name
instanceId=$(ssm-cli get-instance-information | sed -E 's/.*"instance-id":"?([^,"]*)"?.*/\1/')

# Send a test log event
log_stream_name=$instanceId

aws logs create-log-stream --region $region --log-group-name $log_group_name --log-stream-name $log_stream_name

timestamp=$(date -u +%s%N | cut -b1-13)
message="This is a test log event"
sequence_token=$(aws logs describe-log-streams --region $region --log-group-name $log_group_name --log-stream-name-prefix $log_stream_name --query "logStreams[0].uploadSequenceToken" --output text)
aws logs put-log-events --region $region --log-group-name $log_group_name --log-stream-name $log_stream_name --log-events timestamp=$timestamp,message="$message" --sequence-token $sequence_token

echo "Test log event sent"