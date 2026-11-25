import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';

/**
 * Stop and start PRS-PROD once a week so EC2 can place it on a new host.
 * This stack is separate from AutoStartStopEc2Stack, which is
 * UPDATE_ROLLBACK_FAILED and must not be deployed. The schedule names one
 * instance. It does not select the AutoStartStop tag.
 */
export class ProdHostRefreshStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const instanceId = 'i-0463809a6acf143c7';
    const instanceArn = `arn:aws:ec2:${this.region}:${this.account}:instance/${instanceId}`;

    const role = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Stop and start PRS-PROD for the weekly host refresh.',
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['ec2:StopInstances', 'ec2:StartInstances'],
      resources: [instanceArn],
    }));

    const target = (action: 'stopInstances' | 'startInstances'): scheduler.CfnSchedule.TargetProperty => ({
      arn: `arn:aws:scheduler:::aws-sdk:ec2:${action}`,
      roleArn: role.roleArn,
      input: JSON.stringify({ InstanceIds: [instanceId] }),
    });

    new scheduler.CfnSchedule(this, 'WeeklyStop', {
      name: 'roadmap-prod-weekly-stop',
      description: 'Stop PRS-PROD Saturday 04:00 America/Los_Angeles so the host can change.',
      scheduleExpression: 'cron(0 4 ? * SAT *)',
      scheduleExpressionTimezone: 'America/Los_Angeles',
      flexibleTimeWindow: { mode: 'OFF' },
      target: target('stopInstances'),
    });

    new scheduler.CfnSchedule(this, 'WeeklyStart', {
      name: 'roadmap-prod-weekly-start',
      description: 'Start PRS-PROD Saturday 04:10 America/Los_Angeles after the weekly stop.',
      scheduleExpression: 'cron(10 4 ? * SAT *)',
      scheduleExpressionTimezone: 'America/Los_Angeles',
      flexibleTimeWindow: { mode: 'OFF' },
      target: target('startInstances'),
    });
  }
}
