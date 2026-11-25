import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { E2ETestStack } from '../lib/e2e-test-stack';
import { assertE2eBuildScript, assertProvisionScript, e2eBuildScript } from '../scripts/check-buildspec-shell';

const app = new App();

// The scheduled build checks out this GitHub branch for its Playwright files.
// It runs those tests against the live site named by e2eTargetEnv.
const gitOwner = app.node.tryGetContext('gitOwner') || 'bizkite-co';
const gitRepo = app.node.tryGetContext('gitRepo');
const gitBranch = app.node.tryGetContext('gitBranch') || 'uat';

if (!gitRepo) {
  throw new Error('Missing required context variables. Please provide gitRepo.');
}

const stack = new E2ETestStack(app, 'RoadmapE2ETestStack', {
  gitOwner,
  gitRepo,
  gitBranch,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Runs for every `cdk synth` and `cdk deploy`, including `npx cdk deploy`.
assertE2eBuildScript(e2eBuildScript(stack));
assertProvisionScript();