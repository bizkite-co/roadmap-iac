#!/bin/bash

env AWS_REGION=us-east-1 aws route53domains get-domain-detail --domain-name $1