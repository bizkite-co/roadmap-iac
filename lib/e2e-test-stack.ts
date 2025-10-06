import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';

interface E2ETestStackProps extends StackProps {
  gitRepoUrl: string;
  secretName: string;
  snsTopicArn: string;
  scheduleExpression: string; // e.g., 'cron(0 12 * * ? *)' for daily at 12:00 UTC
  reportsBucketPrefix: string; // New prop
}

export class E2ETestStack extends Stack {
  constructor(scope: Construct, id: string, props: E2ETestStackProps) {
    super(scope, id, props);

    // S3 Bucket for Playwright HTML Reports and all test artifacts
    const reportsBucket = new s3.Bucket(this, 'E2ETestReportsBucket', {
      bucketName: `${props.reportsBucketPrefix}-${this.account}-${this.region}`.toLowerCase(), // Use prefix
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Secure by default
      removalPolicy: RemovalPolicy.DESTROY, // WARNING: This will delete the bucket and its contents on stack deletion
      autoDeleteObjects: true, // Automatically delete objects when bucket is destroyed
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // Playwright report is a SPA, so error document should be index.html
    });

    // Define the Lambda function for running E2E tests
    const e2eTestLambda = new lambda.Function(this, 'E2ETestRunnerLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'e2e-test.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: Duration.minutes(10),
      memorySize: 1024,
      environment: {
        GIT_REPO_URL: props.gitRepoUrl,
        SECRET_NAME: props.secretName,
        SNS_TOPIC_ARN: props.snsTopicArn,
        REPORTS_BUCKET_NAME: reportsBucket.bucketName,
      },
    });

    // Grant permissions to the Lambda function
    // 1. Allow reading from Secrets Manager
    e2eTestLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secretsmanager.Secret.fromSecretNameV2(this, 'E2ETestSecret', props.secretName).secretArn],
    }));

    // 2. Allow publishing to SNS topic
    e2eTestLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: [props.snsTopicArn],
    }));

    // 3. Allow read/write to the reports bucket (for all test artifacts)
    reportsBucket.grantReadWrite(e2eTestLambda);

    // Define an EventBridge rule to trigger the Lambda on a schedule
    new events.Rule(this, 'E2ETestSchedule', {
      schedule: events.Schedule.expression(props.scheduleExpression),
      targets: [new targets.LambdaFunction(e2eTestLambda)],
    });

    // Output the URL of the reports bucket for easy access
    new CfnOutput(this, 'E2EReportsBucketWebsiteUrl', {
      value: reportsBucket.bucketWebsiteUrl,
      description: 'URL for the E2E test reports static website',
    });
  }
}