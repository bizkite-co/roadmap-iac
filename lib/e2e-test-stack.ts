import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput, DockerImage } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { execSync } from 'child_process';

interface E2ETestStackProps extends StackProps {
  gitRepoUrl: string; // This will now be unused, but we'll leave it to avoid breaking the interface
  secretName: string;
  snsTopicArn: string;
  scheduleExpression: string;
  reportsBucketPrefix: string;
}

export class E2ETestStack extends Stack {
  constructor(scope: Construct, id: string, props: E2ETestStackProps) {
    super(scope, id, props);

    // S3 Bucket for Playwright HTML Reports and all test artifacts
    const reportsBucket = new s3.Bucket(this, 'E2ETestReportsBucket', {
      bucketName: `${props.reportsBucketPrefix}-${this.account}-${this.region}`.toLowerCase(),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
    });

    // Define the Lambda function for running E2E tests
    const e2eTestLambda = new lambda.Function(this, 'E2ETestRunnerLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      // Asset root is the entire project, to give bundling access to the symlink
      code: lambda.Code.fromAsset('.', {
        // Ignore bulky folders at the root
        exclude: ['.git', 'cdk.out', '.venv', 'node_modules'],
        bundling: {
          image: DockerImage.fromRegistry('public.ecr.aws/sam/build-nodejs22.x'),
          // We are at project root. We need to work inside the 'lambda' directory.
          workingDirectory: '/asset-input/lambda',
          command: [
            'bash', '-c',
            [
              'npm install',
              'npm run build',
              // Copy the built lambda code and its node_modules to the output
              'cp -r . /asset-output',
              // Now, from the output dir, copy the e2e tests from the project root's symlink
              'cp -rL /asset-input/roadmap-website/e2e /asset-output/e2e'
            ].join(' && ')
          ],
        },
      }),
      timeout: Duration.minutes(10),
      memorySize: 1024,
      environment: {
        SECRET_NAME: props.secretName,
        SNS_TOPIC_ARN: props.snsTopicArn,
        REPORTS_BUCKET_NAME: reportsBucket.bucketName,
      },
    });

    // Grant permissions to the Lambda function
    // 1. Allow reading from Secrets Manager for E2E credentials
    e2eTestLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secretsmanager.Secret.fromSecretNameV2(this, 'E2ETestSecret', props.secretName).secretArn],
    }));

    // 2. Allow publishing to SNS topic
    e2eTestLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: [props.snsTopicArn],
    }));

    // 3. Allow read/write to the reports bucket
    reportsBucket.grantReadWrite(e2eTestLambda);

    // Define an EventBridge rule to trigger the Lambda on a schedule
    new events.Rule(this, 'E2ETestSchedule', {
      ruleName: 'roadmap-e2e-regular-schedule',
      schedule: events.Schedule.expression(props.scheduleExpression),
      targets: [new targets.LambdaFunction(e2eTestLambda)],
    });

    // Define a new rule for debugging, disabled by default
    new events.Rule(this, 'E2EDebugSchedule', {
      ruleName: 'roadmap-e2e-debug-schedule',
      schedule: events.Schedule.expression('cron(0 0 1 1 ? 1970)'), // A date in the past
      targets: [new targets.LambdaFunction(e2eTestLambda)],
      enabled: false,
    });

    // Output the URL of the reports bucket for easy access
    new CfnOutput(this, 'E2EReportsBucketWebsiteUrl', {
      value: reportsBucket.bucketWebsiteUrl,
      description: 'URL for the E2E test reports static website',
    });
  }
}
