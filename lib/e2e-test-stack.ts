import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { ResourceNames } from './resource-names';
import fs = require('fs');
import { Schema } from 'effect';
import { StackConfigSchema } from './config-schema';

interface E2ETestStackProps extends StackProps {
  gitOwner: string;            // GitHub owner (bizkite-co)
  gitRepo: string;             // GitHub repo (roadmap-website)
  gitBranch: string;           // branch to clone
  secretName: string;          // Secrets Manager secret holding the E2E user password
  ghTokenSecretName: string;   // Secrets Manager secret holding a GitHub PAT (repo read) for cloning
}

export class E2ETestStack extends Stack {
  constructor(scope: Construct, id: string, props: E2ETestStackProps) {
    super(scope, id, props);

    const rawConfig = JSON.parse(fs.readFileSync('stack.config.json', {encoding: 'utf-8'}));
    const stackConfig = Schema.decodeSync(StackConfigSchema)(rawConfig);
    const names = new ResourceNames(this.node.tryGetContext('environment') || 'prod');

    // Which deployed env to test against. Tests read the resolved base URL from env.
    const targetEnv = (this.node.tryGetContext('e2eTargetEnv') || 'uat') as 'uat' | 'prod';
    const baseUrl = targetEnv === 'prod' ? stackConfig.prod.baseUrl : stackConfig.uat.baseUrl;

    // S3 Bucket for Playwright HTML reports and test artifacts.
    // Name matches the currently-deployed bucket so CDK updates it in place
    // (preserves history; the notification-hub bridge subscription depends on the topic below).
    const reportsBucket = new s3.Bucket(this, 'E2ETestReportsBucket', {
      bucketName: `${names.e2eTestStack.s3Bucket}-${this.account}-${this.region}`.toLowerCase(),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
    });

    // SNS topic for failure notifications. Name matches the deployed topic so the
    // notification-hub bridge (roadmap-website/cdk/lib/notification-hub-bridge-stack.ts)
    // keeps working unchanged.
    const topic = new sns.Topic(this, 'E2ETestTopic', {
      displayName: 'E2E Test Failure Notifications',
      topicName: names.e2eTestStack.snsTopic,
    });

    // Secrets used by the build
    const e2eSecret = secretsmanager.Secret.fromSecretNameV2(this, 'E2ETestSecret', props.secretName);
    const ghSecret = secretsmanager.Secret.fromSecretNameV2(this, 'E2EGhSecret', props.ghTokenSecretName);

    // Dedicated log group for the CodeBuild project (clean retention).
    const logGroup = new logs.LogGroup(this, 'E2ETestRunnerLogGroup', {
      logGroupName: names.e2eTestStack.lambdaFunction.replace(/-lambda$/, '') + '-log-group',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // CodeBuild project that clones roadmap-website, installs Playwright + chromium,
    // runs the E2E tests against the deployed UAT/PROD URL, uploads the HTML report,
    // and publishes to SNS on failure.
    const projectName = names.e2eTestStack.lambdaFunction.replace(/-lambda$/, '');
    const project = new codebuild.Project(this, 'E2ETestRunnerProject', {
      projectName,
      source: codebuild.Source.gitHub({
        owner: props.gitOwner,
        repo: props.gitRepo,
        branchOrRef: props.gitBranch,
        webhook: false,
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false,
      },
      timeout: Duration.minutes(15),
      logging: {
        cloudWatch: { logGroup, enabled: true },
      },
      environmentVariables: {
        BASE_URL: { value: baseUrl },
        TARGET_ENV: { value: targetEnv },
        REPORTS_BUCKET_NAME: { value: reportsBucket.bucketName },
        SNS_TOPIC_ARN: { value: topic.topicArn },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: 0.2,
        env: {
          'secrets-manager': {
            E2E_USER_PASSWORD: `${props.secretName}:SecretString`,
          },
        },
        phases: {
          install: {
            'runtime-versions': { nodejs: 20 },
            commands: [
              'npm ci',
              'npx playwright install --with-deps chromium',
            ],
          },
          build: {
            commands: [
              'export E2E_USER_EMAIL=mark@bizkite.net',
              'export E2E_USER_USERNAME=appdev',
              'export E2E_ENV=$TARGET_ENV',
              'export E2E_BASE_URL=$BASE_URL',
              'export E2E_S3_BUCKETNAME=$REPORTS_BUCKET_NAME',
              'export E2E_S3_REGION=$AWS_REGION',
              'echo "Running Playwright E2E against $E2E_BASE_URL (env=$E2E_ENV)"',
              'EXITCODE=0',
              'npx playwright test --reporter=html || EXITCODE=$?',
              'REPORT_KEY="reports/$(date -u +%Y-%m-%d)/$(date -u +%H-%M-%S)"',
              'aws s3 sync playwright-report/ "s3://$REPORTS_BUCKET_NAME/$REPORT_KEY/" || echo "WARN: report upload failed"',
              'if [ "$EXITCODE" != "0" ]; then aws sns publish --topic-arn "$SNS_TOPIC_ARN" --subject "E2E Test Run Failed" --message "E2E test execution failed against $BASE_URL (env=$TARGET_ENV). See CodeBuild run: https://$AWS_REGION.console.aws.amazon.com/codesuite/codebuild/$AWS_ACCOUNT_ID/projects/' + projectName + '/build/$CODEBUILD_BUILD_ID"; fi',
              'exit $EXITCODE',
            ],
          },
        },
      }),
    });

    // Permissions
    e2eSecret.grantRead(project);
    ghSecret.grantRead(project);
    reportsBucket.grantReadWrite(project);
    topic.grantPublish(project);

    // Wire GitHub auth for the CodeBuild source via a PAT in Secrets Manager.
    // (In this CDK version, `Source.gitHub` no longer takes an inline auth token;
    // a CfnSourceCredential is the supported way. Account+region scoped: if a
    // GitHub source credential already exists in this account/region, replace
    // this with the existing one manually instead of deploying a duplicate.)
    new codebuild.CfnSourceCredential(this, 'GitHubSourceCredential', {
      authType: 'PERSONAL_ACCESS_TOKEN',
      serverType: 'GITHUB',
      token: ghSecret.secretValue.unsafeUnwrap(),
    });

    // EventBridge rule — DISABLED initially so the daily run only starts once
    // we have confirmed a green manual build. Flip `enabled: true` after verification.
    new events.Rule(this, 'E2ETestSchedule', {
      ruleName: names.e2eTestStack.scheduleRule,
      schedule: events.Schedule.expression('cron(0 1 * * ? *)'),
      enabled: false,
      targets: [new targets.CodeBuildProject(project)],
    });

    new events.Rule(this, 'E2EDebugSchedule', {
      ruleName: names.e2eTestStack.debugScheduleRule,
      schedule: events.Schedule.expression('cron(0 0 1 1 ? 1970)'),
      enabled: false,
      targets: [new targets.CodeBuildProject(project)],
    });

    // --- Stack Outputs ---
    new CfnOutput(this, 'E2ETestRunnerProjectName', {
      value: project.projectName,
      description: 'Name of the CodeBuild project that runs E2E tests on a schedule.',
    });
    new CfnOutput(this, 'E2EBaseUrl', {
      value: baseUrl,
      description: 'URL the E2E tests run against (set via e2eTargetEnv context: uat|prod).',
    });
    new CfnOutput(this, 'E2EReportsBucketConsoleUrl', {
      value: `https://s3.console.aws.amazon.com/s3/buckets/${reportsBucket.bucketName}?region=${this.region}`,
      description: 'Direct link to the S3 reports bucket in the AWS Console.',
    });
    new CfnOutput(this, 'SNSTopicArn', {
      value: topic.topicArn,
      description: 'ARN of the SNS topic for failure notifications (consumed by notification-hub bridge).',
    });
  }
}