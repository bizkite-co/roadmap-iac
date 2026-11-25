#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProdHostRefreshStack } from '../lib/prod-host-refresh-stack';

const app = new cdk.App();
new ProdHostRefreshStack(app, 'RoadmapProdHostRefreshStack', {
  env: { account: '865664998993', region: 'us-west-1' },
});
