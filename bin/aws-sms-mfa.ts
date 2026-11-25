#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsSmsMfaStack } from '../lib/aws-sms-mfa-stack';

const app = new cdk.App();
new AwsSmsMfaStack(app, 'RoadmapUatAwsSmsMfaStack', {
  applicationRoleName: 'RoadmapUatInstanceRole',
  environmentName: 'UAT',
  env: { account: '865664998993', region: 'us-west-1' },
});
new AwsSmsMfaStack(app, 'RoadmapProdAwsSmsMfaStack', {
  applicationRoleName: 'RoadmapProdInstanceRole',
  environmentName: 'PROD',
  env: { account: '865664998993', region: 'us-west-1' },
});
