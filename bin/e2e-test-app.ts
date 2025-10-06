import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { E2ETestStack } from '../lib/e2e-test-stack';

const app = new App();

// Retrieve context values
const gitRepoUrl = app.node.tryGetContext('gitRepoUrl');
const secretName = app.node.tryGetContext('secretName');
const snsTopicArn = app.node.tryGetContext('snsTopicArn');
const scheduleExpression = app.node.tryGetContext('scheduleExpression');
const reportsBucketPrefix = app.node.tryGetContext('reportsBucketPrefix');

// Validate context values
if (!gitRepoUrl || !secretName || !snsTopicArn || !scheduleExpression || !reportsBucketPrefix) {
  throw new Error('Missing required context variables. Please provide gitRepoUrl, secretName, snsTopicArn, scheduleExpression, and reportsBucketPrefix.');
}

new E2ETestStack(app, 'RoadmapE2ETestStack', {
  gitRepoUrl,
  secretName,
  snsTopicArn,
  scheduleExpression,
  reportsBucketPrefix,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});