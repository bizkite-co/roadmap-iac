#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AutoStartStopEc2Stack } from '../lib/auto-start-stop-ec2-stack';

const app = new cdk.App();
new AutoStartStopEc2Stack(app, 'AutoStartStopEc2Stack', {
  env: { region: process.env.CDK_DEFAULT_REGION, account: process.env.CDK_DEFAULT_ACCOUNT },
});
