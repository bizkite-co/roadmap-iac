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

    const stackConfig = JSON.parse(fs.readFileSync('stack.config.json', {encoding: 'utf-8'})).uat;

    const lambdaFn = new lambda.Function(this, 'singleton', {
      code: lambda.Code.fromInline(fs.readFileSync('lambda/auto-start-stop-ec2.py', {encoding: 'utf-8'})),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.PYTHON_3_7,
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
      schedule: events.Schedule.expression(stackConfig.autoStopSchedule)
    });

    stopRule.addTarget(new targets.LambdaFunction(lambdaFn, {
      event: events.RuleTargetInput.fromObject({Region: stackConfig.region, Action: 'stop'})
    }));

    // START EC2 instances rule
    const startRule = new events.Rule(this, 'StartRule', {
      schedule: events.Schedule.expression('rate(5 minutes)')
    });

    startRule.addTarget(new targets.LambdaFunction(lambdaFn, {
      event: events.RuleTargetInput.fromObject({Region: stackConfig.region, Action: 'start'})
    }));
  }
}
