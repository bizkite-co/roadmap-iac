#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SecurityCampaignStack } from '../lib/security-campaign-stack';

const app = new cdk.App();
new SecurityCampaignStack(app, 'RoadmapSecurityCampaignStack', {
  env: { account: '865664998993', region: 'us-west-1' },
  synthesizer: new cdk.DefaultStackSynthesizer({ qualifier: 'hbt' }),
});
