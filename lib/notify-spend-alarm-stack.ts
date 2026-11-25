import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export interface NotifySpendAlarmStackProps extends StackProps {
  notifySpendThreshold: number;
}

export class NotifySpendAlarmStack extends Stack {
  constructor(scope: Construct, id: string, props: NotifySpendAlarmStackProps) {
    super(scope, id, props);

    const notificationTopic = sns.Topic.fromTopicArn(
      this,
      'ExistingRoadmapAlarmTopic',
      'arn:aws:sns:us-west-1:865664998993:site-alarm-topic',
    );
    const notifyMonthlySpend = new cloudwatch.Metric({
      namespace: 'AWS/SMSVoice',
      metricName: 'NotifyMessageMonthlySpend',
      statistic: 'Maximum',
      period: Duration.minutes(5),
    });
    const alarm = new cloudwatch.Alarm(this, 'NotifyMonthlySpend60PercentAlarm', {
      alarmName: 'RoadmapNotifyMonthlySpend60PercentAlarm',
      alarmDescription: 'Roadmap PROD Notify spend reached 60% of the current enforced account cap.',
      metric: notifyMonthlySpend,
      threshold: props.notifySpendThreshold,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.IGNORE,
    });
    alarm.addAlarmAction(new actions.SnsAction(notificationTopic));
  }
}
