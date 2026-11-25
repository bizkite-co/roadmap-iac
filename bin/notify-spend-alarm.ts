#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { NotifySpendAlarmStack } from '../lib/notify-spend-alarm-stack';

const app = new App();
new NotifySpendAlarmStack(app, 'RoadmapNotifySpendAlarmStack', {
  env: { account: '865664998993', region: 'us-west-1' },
});
