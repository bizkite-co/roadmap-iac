#!/bin/bash

# Script to list recent deployments of the CloudFormation stack

STACK_NAME="RoadmapE2ETestStack"

echo "Fetching recent deployments for stack: $STACK_NAME"

aws cloudformation describe-stack-events --stack-name "$STACK_NAME" --query "StackEvents[?ResourceType=='AWS::CloudFormation::Stack' && (ResourceStatus=='UPDATE_COMPLETE' || ResourceStatus=='CREATE_COMPLETE')].{Timestamp:Timestamp, Status:ResourceStatus, Reason:ResourceStatusReason}" --output table
