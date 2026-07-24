import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { E2ETestStack } from '../lib/e2e-test-stack';

const app = new App();

// Retrieve context values
const gitOwner = app.node.tryGetContext('gitOwner');
const gitRepo = app.node.tryGetContext('gitRepo');
const gitBranch = app.node.tryGetContext('gitBranch') || 'dev';
const secretName = app.node.tryGetContext('secretName');
const ghTokenSecretName = app.node.tryGetContext('ghTokenSecretName');

// Validate context values
if (!gitOwner || !gitRepo || !secretName || !ghTokenSecretName) {
  throw new Error('Missing required context variables. Please provide gitOwner, gitRepo, secretName, and ghTokenSecretName.');
}

new E2ETestStack(app, 'RoadmapE2ETestStack', {
  gitOwner,
  gitRepo,
  gitBranch,
  secretName,
  ghTokenSecretName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});