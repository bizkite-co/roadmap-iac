#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { UatCloudFrontStack } from '../lib/uat-cloudfront-stack';

const app = new cdk.App();
new UatCloudFrontStack(app, 'RoadmapUatCloudFrontStack', {
  env: { region: process.env.CDK_DEFAULT_REGION, account: process.env.CDK_DEFAULT_ACCOUNT },
});
