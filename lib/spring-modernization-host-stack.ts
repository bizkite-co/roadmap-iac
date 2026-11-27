import { CfnOutput, RemovalPolicy, Stack, StackProps, Duration, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';

const NAME_TAG = 'PRS-SPRING-UPGRADE';

/**
 * Isolated host for the Spring modernization work. This stack deliberately
 * creates no DNS record and has no inbound security-group rules. Use SSM for
 * administration and the separate Ansible playbook for OS configuration.
 */
export class SpringModernizationHostStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });
    const publicSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC });

    const securityGroup = new ec2.SecurityGroup(this, 'HostSecurityGroup', {
      vpc,
      description: 'PRS Spring modernization host; administration is through SSM, no inbound ports.',
      allowAllOutbound: true,
    });

    const role = new iam.Role(this, 'HostInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'Least-privilege instance role for the isolated Spring modernization host.',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });
    // The Ansible SSM connection plugin stages temporary file transfers here.
    // The bucket is private, encrypted, short-lived, and removed with this stack.
    const ansibleTransferBucket = new s3.Bucket(this, 'AnsibleTransferBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(7) }],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    ansibleTransferBucket.grantRead(role);

    const application = new codedeploy.ServerApplication(
      this,
      'RoadmapWebApp',
      { applicationName: 'RoadmapWebApp' },
    );
    new codedeploy.ServerDeploymentGroup(this, 'SpringUpgradeDeploymentGroup', {
      application,
      deploymentGroupName: 'RoadmapWebApp-SPRING-UPGRADE',
      ec2InstanceTags: new codedeploy.InstanceTagSet({ Name: [NAME_TAG] }),
    });

    new logs.LogGroup(this, 'TomcatLogGroup', {
      logGroupName: '/roadmap/spring-upgrade/tomcat',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new logs.LogGroup(this, 'ApacheAccessLogGroup', {
      logGroupName: '/roadmap/spring-upgrade/apache-access',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new logs.LogGroup(this, 'ApacheErrorLogGroup', {
      logGroupName: '/roadmap/spring-upgrade/apache-error',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -eu',
      'if systemctl list-unit-files --no-legend | grep -q \'^amazon-ssm-agent.service\'; then',
      '  systemctl enable --now amazon-ssm-agent',
      'elif systemctl list-unit-files --no-legend | grep -q \'^snap.amazon-ssm-agent.amazon-ssm-agent.service\'; then',
      '  systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service',
      'else',
      '  snap install amazon-ssm-agent --classic',
      '  snap start amazon-ssm-agent',
      'fi',
    );

    const instance = new ec2.Instance(this, 'Host', {
      vpc,
      vpcSubnets: { subnets: publicSubnets.subnets },
      associatePublicIpAddress: true,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M7I, ec2.InstanceSize.LARGE),
      machineImage: ec2.MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/noble/stable/current/amd64/hvm/ebs-gp3/ami-id'),
      role,
      securityGroup,
      userData,
      requireImdsv2: true,
      blockDevices: [{
        deviceName: '/dev/sda1',
        volume: ec2.BlockDeviceVolume.ebs(40, {
          encrypted: true,
          volumeType: ec2.EbsDeviceVolumeType.GP3,
          deleteOnTermination: true,
        }),
      }],
    });

    Tags.of(instance).add('Name', NAME_TAG);
    Tags.of(instance).add('Environment', 'SPRING-UPGRADE');
    Tags.of(instance).add('ManagedBy', 'CDK');

    new CfnOutput(this, 'HostInstanceId', { value: instance.instanceId });
    new CfnOutput(this, 'HostPrivateIp', { value: instance.instancePrivateIp });
    new CfnOutput(this, 'AnsibleTransferBucketName', { value: ansibleTransferBucket.bucketName });
    new CfnOutput(this, 'DeploymentGroupName', { value: 'RoadmapWebApp-SPRING-UPGRADE' });
  }
}
