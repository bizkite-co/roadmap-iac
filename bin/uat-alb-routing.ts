#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { UatAlbRoutingStack } from '../lib/uat-alb-routing-stack';

const app = new cdk.App();
new UatAlbRoutingStack(app, 'RoadmapUatAlbRoutingStack', {
  env: { region: 'us-west-1', account: '865664998993' },
  synthesizer: new cdk.DefaultStackSynthesizer({ qualifier: 'hbt' }),
});
