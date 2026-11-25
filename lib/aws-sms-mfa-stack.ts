import { CfnOutput, CfnParameter, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface AwsSmsMfaStackProps extends StackProps {
  applicationRoleName: string;
  environmentName: 'UAT' | 'PROD';
}

/** Least-privilege AWS End User Messaging Notify permission for one Roadmap environment. */
export class AwsSmsMfaStack extends Stack {
  constructor(scope: Construct, id: string, props: AwsSmsMfaStackProps) {
    super(scope, id, props);

    const notifyConfigurationId = new CfnParameter(this, 'NotifyConfigurationId', {
      type: 'String',
      description: `${props.environmentName} AWS End User Messaging Notify configuration ID.`,
      allowedPattern: '^notify-[a-f0-9]+$',
    });
    const applicationRole = iam.Role.fromRoleName(this, 'RoadmapApplicationInstanceRole',
      props.applicationRoleName, { mutable: true });
    const notifyConfigurationArn = `arn:${this.partition}:sms-voice:${this.region}:${this.account}:notify-configuration/${notifyConfigurationId.valueAsString}`;

    applicationRole.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: `SendRoadmap${props.environmentName}MfaNotifyText`,
      actions: ['sms-voice:SendNotifyTextMessage'],
      resources: [notifyConfigurationArn],
    }));

    new CfnOutput(this, 'SmsRegion', { value: this.region });
    new CfnOutput(this, 'NotifyConfigurationArn', { value: notifyConfigurationArn });
    new CfnOutput(this, 'ApplicationRoleName', { value: props.applicationRoleName });
  }
}
