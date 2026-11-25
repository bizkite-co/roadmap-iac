import { App } from 'aws-cdk-lib';
import { E2ETestStack } from '../lib/e2e-test-stack';
import {
  assertE2eBuildScript,
  assertProvisionScript,
  bashSyntax,
  e2eBuildScript,
} from '../scripts/check-buildspec-shell';

const brokenFind = 'find e2e -type f ( -name "*.js" -o -name "*.d.ts" ) -delete\n';
const broken = bashSyntax(brokenFind, 'broken-find.sh');
if (broken === null) {
  throw new Error('bash -n accepted the find command that failed CodeBuild');
}

const app = new App();
const stack = new E2ETestStack(app, 'RoadmapE2ETestStack', {
  gitOwner: 'bizkite-co',
  gitRepo: 'roadmap-website',
  gitBranch: 'uat',
  env: { account: '865664998993', region: 'us-west-1' },
});

assertE2eBuildScript(e2eBuildScript(stack));
assertProvisionScript();

console.log('buildspec shell syntax ok');
