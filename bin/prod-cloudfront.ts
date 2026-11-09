#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProdCloudFrontStack } from '../lib/prod-cloudfront-stack';

const app = new cdk.App();
new ProdCloudFrontStack(app, 'RoadmapProdCloudFrontStack', {
  env: { region: process.env.CDK_DEFAULT_REGION, account: process.env.CDK_DEFAULT_ACCOUNT },
});
