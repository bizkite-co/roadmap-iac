import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
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
  gitRepoUrl: string; 
  secretName: string;
  scheduleExpression: string;
  reportsBucketPrefix: string;
}

export class E2ETestStack extends Stack {
  constructor(scope: Construct, id: string, props: E2ETestStackProps) {
    super(scope, id, props);

    const rawConfig = JSON.parse(fs.readFileSync('stack.config.json', {encoding: 'utf-8'}));
    const stackConfig = Schema.decodeSync(StackConfigSchema)(rawConfig);

    const names = new ResourceNames(this.node.tryGetContext('environment') || 'prod');

    // S3 Bucket for Playwright HTML Reports and all test artifacts
    const reportsBucket = new s3.Bucket(this, 'E2ETestReportsBucket', {
      bucketName: `${names.e2eTestStack.s3Bucket}-${this.account}-${this.region}`.toLowerCase(),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
    });

    // Create a new SNS Topic for notifications
    const topic = new sns.Topic(this, 'E2ETestTopic', {
      displayName: 'E2E Test Failure Notifications',
      topicName: names.e2eTestStack.snsTopic,
    });

    // Define the Lambda function for running E2E tests
    const e2eTestLambda = new lambda.Function(this, 'E2ETestRunnerLambda', {
      functionName: names.e2eTestStack.lambdaFunction, // Explicitly named Lambda function
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      // This simply zips the lambda directory. Assumes node_modules and e2e tests are present.
      code: lambda.Code.fromAsset('lambda', { exclude: ['.gitkeep'] }), 
      logGroup: new logs.LogGroup(this, 'E2ETestRunnerLogGroup', {
        logGroupName: names.e2eTestStack.logGroup, // Adhere to AWS Lambda log group naming convention
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      timeout: Duration.minutes(10),
      memorySize: 1024,
      environment: {
        SECRET_NAME: props.secretName,
        SNS_TOPIC_ARN: topic.topicArn, // Use the new topic
        REPORTS_BUCKET_NAME: reportsBucket.bucketName,
      },
    });

    // Grant permissions to the Lambda function
    // 1. Allow reading from Secrets Manager for E2E credentials
    e2eTestLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secretsmanager.Secret.fromSecretNameV2(this, 'E2ETestSecret', props.secretName).secretArn],
    }));

    // 2. Allow publishing to the new SNS topic
    topic.grantPublish(e2eTestLambda);

    // 3. Allow read/write to the reports bucket
    reportsBucket.grantReadWrite(e2eTestLambda);

    // Define an EventBridge rule to trigger the Lambda on a schedule
    new events.Rule(this, 'E2ETestSchedule', {
      ruleName: names.e2eTestStack.scheduleRule,
      schedule: events.Schedule.expression('cron(0 1 * * ? *)'),
      targets: [new targets.LambdaFunction(e2eTestLambda)],
    });

    // Define a new rule for debugging, disabled by default
    new events.Rule(this, 'E2EDebugSchedule', {
      ruleName: names.e2eTestStack.debugScheduleRule,
      schedule: events.Schedule.expression('cron(0 0 1 1 ? 1970)'), // A date in the past
      targets: [new targets.LambdaFunction(e2eTestLambda)],
      enabled: false,
    });

    // --- Stack Outputs ---

    new CfnOutput(this, 'E2EReportsBucketWebsiteUrl', {
      value: reportsBucket.bucketWebsiteUrl,
      description: 'URL for the E2E test reports static website',
    });

    new CfnOutput(this, 'E2EReportsBucketConsoleUrl', {
      value: `https://s3.console.aws.amazon.com/s3/buckets/${reportsBucket.bucketName}?region=${this.region}`,
      description: 'Direct link to the S3 bucket in the AWS Console',
    });

    new CfnOutput(this, 'E2ELambdaLogGroupConsoleUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:log-groups/log-group/${names.e2eTestStack.logGroup.replace(/\//g, '$252F')}`,
      description: 'Direct link to the Lambda function\'s log group in the AWS Console',
    });

    new CfnOutput(this, 'SNSTopicArn', {
      value: topic.topicArn,
      description: 'ARN of the new SNS topic for notifications',
    });
  }
}
