import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import fs = require('fs');

export class AutoStartStopEc2Stack extends cdk.Stack {
  constructor (scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stackConfig = JSON.parse(fs.readFileSync('stack.config.json', {encoding: 'utf-8'}));
    const uatConfig = stackConfig.uat;
    const prodConfig = stackConfig.prod;

    const snsTopicArn = this.node.getContext('snsTopicArn');

    const lambdaFn = new lambda.Function(this, 'singleton', {
      code: lambda.Code.fromInline(fs.readFileSync('lambda/auto-start-stop-ec2.py', {encoding: 'utf-8'})),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.PYTHON_3_9,
    });

    lambdaFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ec2:DescribeInstances',
        'ec2:StartInstances',
        'ec2:StopInstances'
      ],
      resources: ['*']
    }));

    // STOP EC2 instances rule
    const stopRule = new events.Rule(this, 'StopRule', {
      schedule: events.Schedule.expression(uatConfig.autoStopSchedule)
    });

    stopRule.addTarget(new targets.LambdaFunction(lambdaFn, {
      event: events.RuleTargetInput.fromObject({Region: uatConfig.region, Action: 'stop'})
    }));

    // START EC2 instances rule
    const startRule = new events.Rule(this, 'StartRule', {
      schedule: events.Schedule.expression('rate(5 minutes)')
    });

    startRule.addTarget(new targets.LambdaFunction(lambdaFn, {
      event: events.RuleTargetInput.fromObject({Region: uatConfig.region, Action: 'start'})
    }));

    // E2E Test Lambda Function
    const e2eTestLambda = new lambda.Function(this, 'e2eTestLambda', {
      code: lambda.Code.fromInline(fs.readFileSync('lambda/e2e-test.py', {encoding: 'utf-8'})),
      handler: 'main',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.PYTHON_3_9,
      environment: {
        SNS_TOPIC_ARN: snsTopicArn
      }
    });

    e2eTestLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        'sns:Publish'
      ],
      resources: ['*']
    }));

    // E2E Test Rules
    const e2eTestRules: events.Rule[] = [];
    prodConfig.e2eTestSchedule.forEach((schedule: string, index: number) => {
      const e2eTestRule = new events.Rule(this, `e2eTestRule${index}`, {
        schedule: events.Schedule.expression(schedule),
      });

      e2eTestRule.addTarget(new targets.LambdaFunction(e2eTestLambda));
      e2eTestRules.push(e2eTestRule);
    });

    // Stack Outputs
    new cdk.CfnOutput(this, 'AutoStartStopLambdaArn', {
      value: lambdaFn.functionArn,
      description: 'The ARN of the Lambda function that starts and stops the EC2 instances.'
    });

    new cdk.CfnOutput(this, 'E2eTestLambdaArn', {
      value: e2eTestLambda.functionArn,
      description: 'The ARN of the Lambda function that runs the E2E tests.'
    });

    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: snsTopicArn,
      description: 'The ARN of the SNS topic that receives failure notifications.'
    });

    new cdk.CfnOutput(this, 'StopRuleName', {
      value: stopRule.ruleName,
      description: 'The name of the CloudWatch Event Rule that stops the EC2 instances.'
    });

    new cdk.CfnOutput(this, 'StartRuleName', {
      value: startRule.ruleName,
      description: 'The name of the CloudWatch Event Rule that starts the EC2 instances.'
    });

    e2eTestRules.forEach((rule: events.Rule, index: number) => {
      new cdk.CfnOutput(this, `E2eTestRuleName${index}`, {
        value: rule.ruleName,
        description: `The name of the CloudWatch Event Rule that triggers the E2E test ${index}.`
      });
    });
  }
}
