#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SesOutboundMailStack } from '../lib/ses-outbound-mail-stack';

const app = new cdk.App();
new SesOutboundMailStack(app, 'RoadmapSesOutboundMailStack', {
  env: { account: '865664998993', region: 'us-west-1' },
});
