import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

/** Records the SES settings and grants the application role API send access. */
export class SesOutboundMailStack extends Stack {
  static readonly fromAddress = 'support@retirementtaxanalyzer.com';
  static readonly configurationSetName = 'prs-default';
  static readonly regionName = 'us-west-1';
  static readonly applicationRoleName = 'AmazonSSMRoleForInstancesQuickSetup';

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const applicationRole = iam.Role.fromRoleName(this, 'RoadmapApplicationInstanceRole',
      SesOutboundMailStack.applicationRoleName, { mutable: true });
    const senderIdentityArn = `arn:${this.partition}:ses:${SesOutboundMailStack.regionName}:${this.account}:identity/${SesOutboundMailStack.fromAddress}`;
    const configurationSetArn = `arn:${this.partition}:ses:${SesOutboundMailStack.regionName}:${this.account}:configuration-set/${SesOutboundMailStack.configurationSetName}`;

    applicationRole.addToPrincipalPolicy(new iam.PolicyStatement({
      sid: 'SendRoadmapMailWithSesApi',
      actions: ['ses:SendEmail'],
      resources: [senderIdentityArn, configurationSetArn],
      conditions: {
        StringEquals: {
          'ses:FromAddress': SesOutboundMailStack.fromAddress,
        },
      },
    }));

    new CfnOutput(this, 'SesRegion', { value: SesOutboundMailStack.regionName });
    new CfnOutput(this, 'SesFromAddress', { value: SesOutboundMailStack.fromAddress });
    new CfnOutput(this, 'SesConfigurationSet', { value: SesOutboundMailStack.configurationSetName });
    new CfnOutput(this, 'ApplicationRoleName', { value: SesOutboundMailStack.applicationRoleName });
  }
}
