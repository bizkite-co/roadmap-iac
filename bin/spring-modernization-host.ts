#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SpringModernizationHostStack } from '../lib/spring-modernization-host-stack';

const app = new cdk.App();
const account = process.env.AWS_ACCOUNT_ID;
if (!account) {
  throw new Error('AWS_ACCOUNT_ID is required. Source the isolated UAT credentials before synthesizing or deploying.');
}
new SpringModernizationHostStack(app, 'RoadmapSpringModernizationHostStack', {
  env: { account, region: process.env.AWS_REGION ?? 'us-west-1' },
});
