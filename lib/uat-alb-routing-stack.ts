import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

/** Routes only UAT host traffic through the existing PROD ALB. */
export class UatAlbRoutingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const uatInstanceId = 'i-0720b0b18964dae7f';
    const vpcId = 'vpc-45b01b23';
    const prodAlbListenerArn =
      'arn:aws:elasticloadbalancing:us-west-1:865664998993:listener/app/roadmap-prod-origin/7d58f577938979e6/8c1931789c79935b';
    const prodAlbSecurityGroupId = 'sg-0311876dcdc8d6a4b';
    const uatHttpSecurityGroupId = 'sg-0c70c1e40148e1216';

    const uatTargetGroup = new elbv2.CfnTargetGroup(this, 'UatTargetGroup', {
      name: 'roadmap-uat-origin',
      vpcId,
      protocol: 'HTTP',
      port: 80,
      targetType: 'instance',
      targets: [{ id: uatInstanceId, port: 80 }],
      healthCheckEnabled: true,
      healthCheckProtocol: 'HTTP',
      healthCheckPort: 'traffic-port',
      healthCheckPath: '/roadmap/login.html',
      matcher: { httpCode: '200-399' },
      tags: [
        { key: 'Name', value: 'roadmap-uat-origin' },
        { key: 'Environment', value: 'uat' },
        { key: 'ManagedBy', value: 'roadmap-iac' },
      ],
    });

    new elbv2.CfnListenerRule(this, 'UatHostRoutingRule', {
      listenerArn: prodAlbListenerArn,
      priority: 10,
      conditions: [
        {
          field: 'host-header',
          hostHeaderConfig: { values: ['uat.roadmappartners.net'] },
        },
      ],
      actions: [{ type: 'forward', targetGroupArn: uatTargetGroup.ref }],
    });

    new ec2.CfnSecurityGroupIngress(this, 'AllowAlbToUatHttp', {
      groupId: uatHttpSecurityGroupId,
      ipProtocol: 'tcp',
      fromPort: 80,
      toPort: 80,
      sourceSecurityGroupId: prodAlbSecurityGroupId,
      description: 'Allow the Roadmap ALB to reach the UAT HTTP origin',
    });

    new CfnOutput(this, 'UatTargetGroupArn', {
      value: uatTargetGroup.ref,
    });
  }
}
