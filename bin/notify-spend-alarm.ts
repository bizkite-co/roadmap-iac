#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { NotifySpendAlarmStack } from '../lib/notify-spend-alarm-stack';

const app = new App();
const threshold = Number(app.node.tryGetContext('notifySpendThreshold'));
if (!Number.isFinite(threshold) || threshold <= 0) {
  throw new Error('Pass -c notifySpendThreshold=<60-percent-of-current-enforced-Notify-cap>. Use the deploy helper to calculate it.');
}
new NotifySpendAlarmStack(app, 'RoadmapNotifySpendAlarmStack', {
  env: { account: '865664998993', region: 'us-west-1' },
  notifySpendThreshold: threshold,
});
