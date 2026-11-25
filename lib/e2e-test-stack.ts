import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { ResourceNames } from './resource-names';
import fs = require('fs');
import path = require('path');
import { Schema } from 'effect';
import { StackConfigSchema } from './config-schema';

interface E2ETestStackProps extends StackProps {
  gitOwner: string;            // GitHub owner (bizkite-co)
  gitRepo: string;             // GitHub repository name (roadmap-website)
  gitBranch: string;           // branch whose test files the scheduled run checks out
}

export class E2ETestStack extends Stack {
  constructor(scope: Construct, id: string, props: E2ETestStackProps) {
    super(scope, id, props);

    const rawConfig = JSON.parse(fs.readFileSync('stack.config.json', {encoding: 'utf-8'}));
    const stackConfig = Schema.decodeSync(StackConfigSchema)(rawConfig);
    const names = new ResourceNames(this.node.tryGetContext('environment') || 'prod');

    // Which deployed env to test against. Playwright specs request /roadmap/...
    // so the base URL is the site origin, not the app base that already includes /roadmap.
    const targetEnv = (this.node.tryGetContext('e2eTargetEnv') || 'prod') as 'uat' | 'prod';
    const appBaseUrl = targetEnv === 'prod' ? stackConfig.prod.baseUrl : stackConfig.uat.baseUrl;
    const baseUrl = appBaseUrl.replace(/\/roadmap\/?$/, '');

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

    // The build generates a password and creates the UAT user. Nothing is stored in Secrets Manager.
    const provisionScriptB64 = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'provision-e2e-user.sh')).toString('base64');

    // Dedicated log group for the CodeBuild project (clean retention).
    const logGroup = new logs.LogGroup(this, 'E2ETestRunnerLogGroup', {
      logGroupName: names.e2eTestStack.lambdaFunction + '-log-group',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // CodeBuild checks out the Playwright files from GitHub. The browser then
    // opens the live site in BASE_URL. webhook is off so a push does not start a run.
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
        E2E_DB_VIA: { value: 'ssm' },
        E2E_DB_INSTANCE_TAG: { value: targetEnv === 'prod' ? 'PRS-PROD' : 'PRS-UAT' },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: 0.2,
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
              // One shell. CodeBuild does not keep EXITCODE or exports across commands,
              // so a later command would miss the Playwright status and skip the alert.
              [
                'bash <<\'BASH\'',
                'set +e',
                'export E2E_ENV="$TARGET_ENV"',
                'export E2E_BASE_URL="$BASE_URL"',
                'export E2E_S3_BUCKETNAME="$REPORTS_BUCKET_NAME"',
                'export E2E_S3_REGION="$AWS_REGION"',
                'export CI=true',
                'export E2E_DB_VIA=ssm',
                'mkdir -p e2e/scripts',
                `printf '%s' '${provisionScriptB64}' | base64 -d > e2e/scripts/provision-e2e-user.sh`,
                'chmod +x e2e/scripts/provision-e2e-user.sh',
                'ENV_FILE=$(mktemp)',
                'export E2E_USER_ENV_FILE="$ENV_FILE"',
                'cleanup() { bash e2e/scripts/provision-e2e-user.sh delete || echo "WARN: e2e user cleanup failed"; rm -f "$ENV_FILE"; }',
                'trap cleanup EXIT',
                'if ! bash e2e/scripts/provision-e2e-user.sh create; then echo "E2E user provisioning failed"; exit 1; fi',
                'set -a',
                '. "$ENV_FILE"',
                'set +a',
                'rm -f "$ENV_FILE"',
                'python3 - <<\'PY\'',
                'from pathlib import Path',
                'p = Path("playwright.config.ts")',
                'text = p.read_text()',
                'old = "baseURL: \'http://localhost:8080\'"',
                'new = "baseURL: process.env.E2E_BASE_URL || \'http://localhost:8080\'"',
                'if "E2E_BASE_URL" in text:',
                '    print("playwright baseURL already follows E2E_BASE_URL")',
                'elif old not in text:',
                '    raise SystemExit("playwright.config.ts has no localhost baseURL to override")',
                'else:',
                '    p.write_text(text.replace(old, new, 1))',
                '    print("patched playwright baseURL")',
                'PY',
                'echo "Running Playwright E2E against $E2E_BASE_URL (env=$E2E_ENV)"',
                'find e2e -type f -name "*.js" -delete',
                'find e2e -type f -name "*.d.ts" -delete',
                'npx playwright test --project=chromium --reporter=html',
                'EXITCODE=$?',
                'REPORT_KEY="reports/$(date -u +%Y-%m-%d)/$(date -u +%H-%M-%S)"',
                'aws s3 sync playwright-report/ "s3://$REPORTS_BUCKET_NAME/$REPORT_KEY/" || echo "WARN: report upload failed"',
                'exit $EXITCODE',
                'BASH',
              ].join('\n'),
            ],
          },
        },
      }),
    });

    // Permissions. The password is generated in the build and sent to UAT only as a hash.
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ec2:DescribeInstances'],
      resources: ['*'],
    }));
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:SendCommand'],
      resources: [
        `arn:aws:ec2:${this.region}:${this.account}:instance/*`,
        `arn:aws:ssm:${this.region}::document/AWS-RunShellScript`,
      ],
    }));
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetCommandInvocation'],
      resources: ['*'],
    }));
    reportsBucket.grantReadWrite(project);
    topic.grantPublish(project);

    // Any failed build, including a Secrets Manager or clone failure before the
    // buildspec runs, publishes to the topic the notification-hub bridge subscribes to.
    // The message is fixed text so the CodeBuild event cannot forward the test password.
    new events.Rule(this, 'E2ETestFailureNotify', {
      eventPattern: {
        source: ['aws.codebuild'],
        detailType: ['CodeBuild Build State Change'],
        detail: {
          'build-status': ['FAILED'],
          'project-name': [projectName],
        },
      },
      targets: [new targets.SnsTopic(topic, {
        message: events.RuleTargetInput.fromText(
          `E2E test execution failed against ${baseUrl} (env=${targetEnv}). See the CodeBuild project ${projectName} in ${this.region}.`
        ),
      })],
    });

    // Weekday runs from stack.config.json.
    stackConfig.prod.e2eTestSchedule.forEach((expression, index) => {
      new events.Rule(this, index === 0 ? 'E2ETestSchedule' : `E2ETestSchedule${index}`, {
        ruleName: index === 0 ? names.e2eTestStack.scheduleRule : `${names.e2eTestStack.scheduleRule}-${index}`,
        schedule: events.Schedule.expression(expression),
        enabled: true,
        targets: [new targets.CodeBuildProject(project)],
      });
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