#!/bin/bash

OPERATION_ID=$1

env AWS_REGION=us-east-1 aws route53domains get-operation-detail --operation-id $OPERATION_ID
STATUS=$(env AWS_REGION=us-east-1 aws route53domains get-operation-detail --operation-id $OPERATION_ID --query Status --output text)

echo "Domain transfer status: $STATUS"
