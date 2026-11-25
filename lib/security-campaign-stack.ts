import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import * as path from 'path';

/** Durable, paced sender for the one-time Roadmap security email campaign. */
export class SecurityCampaignStack extends Stack {
  static readonly fromAddress = 'Higginbotham Retirement Roadmap <support@retirementtaxanalyzer.com>';
  static readonly sesConfigurationSet = 'prs-default';
  static readonly sesRegion = 'us-west-1';

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // The recipient snapshot is PII. Keep it private, encrypted, and short-lived.
    const campaignBucket = new s3.Bucket(this, 'CampaignDataBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(90) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Individual send outcomes are retained as the authoritative send record.
    const sendLog = new dynamodb.Table(this, 'CampaignSendLog', {
      partitionKey: { name: 'campaignId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'recipientIndex', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const senderLog = new logs.LogGroup(this, 'SenderLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const sender = new lambda.Function(this, 'CampaignSender', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'security_campaign_sender.handler',
      code: lambda.Code.fromAsset(path.join(process.cwd(), 'lambda', 'security-campaign')),
      timeout: Duration.seconds(30),
      memorySize: 256,
      logGroup: senderLog,
      environment: {
        CAMPAIGN_BUCKET: campaignBucket.bucketName,
        SEND_LOG_TABLE: sendLog.tableName,
        SES_CONFIGURATION_SET: SecurityCampaignStack.sesConfigurationSet,
        SES_REGION: SecurityCampaignStack.sesRegion,
        FROM_ADDRESS: SecurityCampaignStack.fromAddress,
      },
    });

    sender.addToRolePolicy(new iam.PolicyStatement({
      sid: 'ReadCampaignObjects',
      actions: ['s3:GetObject'],
      resources: [campaignBucket.arnForObjects('campaigns/*')],
    }));
    sender.addToRolePolicy(new iam.PolicyStatement({
      sid: 'RecordCampaignSendStatus',
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
      resources: [sendLog.tableArn],
    }));
    sender.addToRolePolicy(new iam.PolicyStatement({
      sid: 'SendRoadmapCampaignMail',
      actions: ['ses:SendEmail'],
      resources: [
        `arn:${this.partition}:ses:${SecurityCampaignStack.sesRegion}:${this.account}:identity/support@retirementtaxanalyzer.com`,
        `arn:${this.partition}:ses:${SecurityCampaignStack.sesRegion}:${this.account}:configuration-set/${SecurityCampaignStack.sesConfigurationSet}`,
      ],
      conditions: {
        StringEquals: { 'ses:FromAddress': 'support@retirementtaxanalyzer.com' },
      },
    }));

    const sendOne = new tasks.LambdaInvoke(this, 'SendOneRecipient', {
      lambdaFunction: sender,
      payload: sfn.TaskInput.fromObject({
        campaignId: sfn.JsonPath.stringAt('$.campaignId'),
        index: sfn.JsonPath.numberAt('$.index'),
      }),
      payloadResponseOnly: true,
      resultPath: '$.sendResult',
    });

    const done = new sfn.Succeed(this, 'CampaignComplete');
    const ambiguous = new sfn.Fail(this, 'PausedForAmbiguousSend', {
      error: 'AmbiguousSendResult',
      cause: 'A recipient send may have been accepted by SES without a confirmed response. Review the send log before resuming.',
    });
    const wait = new sfn.Wait(this, 'PaceBetweenRecipients', {
      time: sfn.WaitTime.duration(Duration.seconds(156)),
    });
    const nextRecipient = new sfn.Pass(this, 'AdvanceRecipient', {
      parameters: {
        'campaignId.$': '$.campaignId',
        'index.$': '$.sendResult.nextIndex',
        'total.$': '$.total',
        'delaySeconds.$': '$.delaySeconds',
      },
    });
    const routeResult = new sfn.Choice(this, 'CheckSendResult')
      .when(sfn.Condition.stringEquals('$.sendResult.status', 'AMBIGUOUS'), ambiguous)
      .when(sfn.Condition.numberEqualsJsonPath('$.sendResult.nextIndex', '$.total'), done)
      .otherwise(wait);

    wait.next(nextRecipient).next(sendOne);
    const definition = sendOne.next(routeResult);
    const workflowLog = new logs.LogGroup(this, 'WorkflowLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const stateMachine = new sfn.StateMachine(this, 'SecurityCampaignWorkflow', {
      stateMachineName: 'RoadmapSecurityEmailCampaign',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: Duration.hours(26),
      logs: {
        destination: workflowLog,
        level: sfn.LogLevel.ALL,
        includeExecutionData: false,
      },
    });

    new CfnOutput(this, 'CampaignBucketName', { value: campaignBucket.bucketName });
    new CfnOutput(this, 'CampaignSendLogTableName', { value: sendLog.tableName });
    new CfnOutput(this, 'CampaignStateMachineArn', { value: stateMachine.stateMachineArn });
    new CfnOutput(this, 'CampaignSenderFunctionName', { value: sender.functionName });
  }
}
