#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SpringModernizationHostStack } from '../lib/spring-modernization-host-stack';

const app = new cdk.App();
new SpringModernizationHostStack(app, 'RoadmapSpringModernizationHostStack', {
  env: { account: '865664998993', region: 'us-west-1' },
});
