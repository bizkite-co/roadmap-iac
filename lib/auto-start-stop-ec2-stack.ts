import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ssm from 'aws-cdk-lib/aws-ssm';

import fs = require('fs');
import { Schema } from 'effect';
import { StackConfigSchema } from './config-schema';
import { CertificateAutomationConstruct } from './certificate-automation-construct'; // Import the new construct

// Removed: Interface for stack props with certificate ARNs
// interface AutoStartStopEc2StackProps extends cdk.StackProps {
//   roadmapPartnersCertificateArn: string;
//   retirementTaxAnalyzerCertificateArn: string;
// }

export class AutoStartStopEc2Stack extends cdk.Stack {
  // Changed constructor to accept optional props
  constructor (scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const rawConfig = JSON.parse(fs.readFileSync('stack.config.json', {encoding: 'utf-8'}));
    
    // Validate the config strictly using Effect Schema
    const stackConfig = Schema.decodeSync(StackConfigSchema)(rawConfig);
    const uatConfig = stackConfig.uat;
    const prodConfig = stackConfig.prod;

    // Create SNS Topic for alerts
    const certificateAlertTopic = new sns.Topic(this, 'CertificateAlertTopic', {
      displayName: 'ACM Certificate Expiration Alerts'
    });

    // Use the created SNS topic ARN for Lambda functions
    const snsTopicArn = certificateAlertTopic.topicArn;

    const lambdaFn = new lambda.Function(this, 'singleton', {
      code: lambda.Code.fromInline(fs.readFileSync('lambda/auto-start-stop-ec2.py', {encoding: 'utf-8'})),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.PYTHON_3_9,
      environment: {
        SNS_TOPIC_ARN: snsTopicArn
      }
    });

    lambdaFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ec2:DescribeInstances',
        'ec2:StartInstances',
        'ec2:StopInstances'
      ],
      resources: ['*']
    }));

    // STOP EC2 instances rule for UAT
    let stopRuleUat: events.Rule | undefined = undefined;
    if (uatConfig.autoStopSchedule) {
      stopRuleUat = new events.Rule(this, 'StopRuleUat', {
        schedule: events.Schedule.expression(uatConfig.autoStopSchedule)
      });

      stopRuleUat.addTarget(new targets.LambdaFunction(lambdaFn, {
        event: targets.RuleTargetInput.fromObject({Region: uatConfig.region, Action: 'stop'})
      }));
    }

    // STOP/START EC2 instances rule for PROD (Friday night for AWS maintenance)
    let stopStartRuleProd: events.Rule | undefined = undefined;
    if (prodConfig.autoStopStartSchedule) {
      stopStartRuleProd = new events.Rule(this, 'StopStartRuleProd', {
        schedule: events.Schedule.expression(prodConfig.autoStopStartSchedule)
      });

      stopStartRuleProd.addTarget(new targets.LambdaFunction(lambdaFn, {
        event: targets.RuleTargetInput.fromObject({Region: prodConfig.region, Action: 'stopstart'})
      }));
    }

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
        ruleName: `${id}-e2eTestRule${index}`,
        schedule: events.Schedule.expression(schedule),
      });

      e2eTestRule.addTarget(new targets.LambdaFunction(e2eTestLambda));
      e2eTestRules.push(e2eTestRule);
    });

    // Instantiation of CertificateAutomationConstruct
    const certificateAutomation = new CertificateAutomationConstruct(this, 'CertificateAutomation', {
      certificateAlertTopic: certificateAlertTopic,
    });

    // Lambda function to trigger certificate deployment via SSM Run Command.
    // On ACM renewal, this Lambda fetches the new cert from ACM and installs it
    // on the EC2 instance by running the install-new-certs.yml Ansible playbook
    // via SSM AWS-RunShellScript. The playbook lives in roadmap-iac on the developer
    // machine, not on the EC2 itself — so we pass the cert ARNs as shell env vars
    // and run the install steps directly via SSM rather than calling ansible-playbook.
    const deployCertificateLambda = new lambda.Function(this, 'DeployCertificateLambda', {
      code: lambda.Code.fromInline(`
import boto3
import os
import logging
import json

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ssm_client = boto3.client('ssm')
acm_client = boto3.client('acm', region_name='us-east-1')

def main(event, context):
    """
    Triggered by EventBridge on ACM Certificate Validation Success.
    Fetches the renewed cert body from ACM and installs it on the PROD EC2
    instance via SSM Run Command (AWS-RunShellScript).
    """
    logger.info("Received event: " + json.dumps(event))

    target_instance_id = os.environ.get('TARGET_INSTANCE_ID')
    rta_cert_arn = os.environ.get('RTA_CERT_ARN')

    if not target_instance_id:
        logger.error("TARGET_INSTANCE_ID environment variable not set.")
        return {'statusCode': 500, 'body': 'TARGET_INSTANCE_ID not configured.'}

    if not rta_cert_arn:
        logger.error("RTA_CERT_ARN environment variable not set.")
        return {'statusCode': 500, 'body': 'RTA_CERT_ARN not configured.'}

    try:
        # Export the renewed cert from ACM
        cert_response = acm_client.get_certificate(CertificateArn=rta_cert_arn)
        cert_body = cert_response['Certificate']
        cert_chain = cert_response.get('CertificateChain', '')

        # Write cert to disk and reload Apache via SSM
        commands = [
            f'echo "{cert_body}" | sudo tee /etc/ssl/certs/retirementtaxanalyzer.crt',
            f'echo "{cert_chain}" | sudo tee /etc/ssl/certs/godaddy-chain.crt',
            'sudo apachectl configtest',
            'sudo systemctl reload apache2',
            'echo "Certificate install complete"'
        ]

        response = ssm_client.send_command(
            InstanceIds=[target_instance_id],
            DocumentName='AWS-RunShellScript',
            Parameters={'commands': commands},
            Comment='Automated ACM certificate deployment'
        )
        command_id = response['Command']['CommandId']
        logger.info(f"SSM Run Command sent: {command_id}")
        return {'statusCode': 200, 'body': f'SSM command triggered: {command_id}'}

    except Exception as e:
        logger.error(f"Error deploying certificate: {e}")
        return {'statusCode': 500, 'body': f'Error: {e}'}
      `),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(60),
      runtime: lambda.Runtime.PYTHON_3_9,
      environment: {
        TARGET_INSTANCE_ID: prodConfig.instanceId,  // i-0463809a6acf143c7 (PRS-PROD, us-west-1)
        RTA_CERT_ARN: 'arn:aws:acm:us-east-1:865664998993:certificate/e41aabd9-731c-48f0-923b-8cb54906703f'
      }
    });


    // Grant the deployment Lambda permissions to use Systems Manager Run Command
    deployCertificateLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ssm:SendCommand',
        'ssm:GetCommandInvocation' // Optional: if you want to check command status
      ],
      resources: [
        `arn:aws:ec2:${this.region}:${this.account}:instance/${prodConfig.instanceId}`,
        `arn:aws:ssm:${this.region}::document/AWS-RunShellScript` // Or your custom SSM document ARN
      ]
    }));

    // EventBridge Rule to trigger certificate deployment on ACM validation success
    // This rule now expects the event to be put onto the bus externally
    new events.Rule(this, 'AcmValidationSuccessRule', {
      eventPattern: {
        source: ['custom.certificate.automation'],
        detailType: ['ACM Certificate Validation Success'],
        // You could add more specific detail filtering here if needed
      },
      targets: [new targets.LambdaFunction(deployCertificateLambda, {
        // Pass the event detail to the target Lambda
        event: targets.RuleTargetInput.fromEventPath('$.detail')
      })]
    });

    // Lambda function for certificate health checks
    const checkCertificateHealthLambda = new lambda.Function(this, 'CheckCertificateHealthLambda', {
      code: lambda.Code.fromInline(fs.readFileSync('lambda/check-certificate-health.py', {encoding: 'utf-8'})),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(60), // Adjust timeout as needed
      runtime: lambda.Runtime.PYTHON_3_9,
      environment: {
        SNS_TOPIC_ARN: certificateAlertTopic.topicArn, // Pass the alert topic ARN
        DOMAINS_TO_CHECK: JSON.stringify([
          {
            "hostname": "retirementtaxanalyzer.com",
            "port": 443,
            "expected_path": "/",
            "expected_issuer_contains": "Amazon",
            "require_cloudfront": true
          },
          {
            "hostname": "roadmappartners.net",
            "port": 443,
            "expected_path": "/roadmap/login.html",
            "expected_issuer_contains": "Amazon",
            "require_cloudfront": true
          },
          {
            "hostname": "uat.roadmappartners.net",
            "port": 443,
            "expected_path": "/roadmap/login.html",
            "expected_issuer_contains": "Amazon",
            "require_cloudfront": true
          }
        ])
      }
    });

    // Grant the health check Lambda permissions to publish to SNS
    checkCertificateHealthLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'sns:Publish'
      ],
      resources: [certificateAlertTopic.topicArn]
    }));

    // EventBridge Rule to trigger certificate health checks periodically (e.g., daily)
    new events.Rule(this, 'CertificateHealthCheckRule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '6' }), // Example: Run daily at 6:00 AM UTC
      targets: [new targets.LambdaFunction(checkCertificateHealthLambda)]
    });

    // Import existing Route 53 hosted zones — both already exist and are managed externally.
    // Creating new HostedZone constructs would produce duplicate zones and break DNS.
    const roadmapPartnersHostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'RoadmapPartnersHostedZone', {
      hostedZoneId: 'Z04879222BU448TUVC86H',
      zoneName: 'roadmappartners.net'
    });

    const retirementTaxAnalyzerHostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'RetirementTaxAnalyzerHostedZone', {
      hostedZoneId: 'Z0793299AG2CLVJ6NTM5',
      zoneName: 'retirementtaxanalyzer.com'
    });

    // NOTE: CfnDomain (route53domains) constructs were removed.
    // Both domains are already registered with AWS Route 53 Domains.
    // The previous code had placeholder contact info (123 Main St / admin@example.com)
    // which would have overwritten real registrar data on deploy.

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

    new cdk.CfnOutput(this, 'CertificateAlertTopicArn', {
      value: certificateAlertTopic.topicArn,
      description: 'The ARN of the SNS topic for certificate expiration alerts.'
    });

    new cdk.CfnOutput(this, 'RoadmapPartnersCertificateArn', {
      value: certificateAutomation.roadmapPartnersCertificateArn,
      description: 'The ARN of the ACM certificate for *.roadmappartners.net.'
    });

    new cdk.CfnOutput(this, 'RetirementTaxAnalyzerCertificateArn', {
      value: certificateAutomation.retirementTaxAnalyzerCertificateArn,
      description: 'The ARN of the ACM certificate for retirementtaxanalyzer.com.'
    });

    new cdk.CfnOutput(this, 'VerifyDnsPropagationLambdaArn', {
      value: certificateAutomation.verifyDnsPropagationLambdaArn,
      description: 'The ARN of the Lambda function that verifies DNS propagation for ACM certificates.'
    });

    new cdk.CfnOutput(this, 'DeployCertificateLambdaArn', {
      value: deployCertificateLambda.functionArn,
      description: 'The ARN of the Lambda function that triggers certificate deployment.'
    });

    new cdk.CfnOutput(this, 'CheckCertificateHealthLambdaArn', {
      value: checkCertificateHealthLambda.functionArn,
      description: 'The ARN of the Lambda function that performs certificate health checks.'
    });

    new cdk.CfnOutput(this, 'RoadmapPartnersHostedZoneId', {
      value: roadmapPartnersHostedZone.hostedZoneId,
      description: 'The ID of the Route 53 Hosted Zone for roadmappartners.net (Z04879222BU448TUVC86H).'
    });

    new cdk.CfnOutput(this, 'RetirementTaxAnalyzerHostedZoneId', {
      value: retirementTaxAnalyzerHostedZone.hostedZoneId,
      description: 'The ID of the Route 53 Hosted Zone for retirementtaxanalyzer.com (Z0793299AG2CLVJ6NTM5).'
    });

    // NOTE: RoadmappartnersDomainId and RetirementTaxAnalyzerDomainId outputs removed
    // alongside the CfnDomain constructs (placeholder data, domains already registered).


    // Add outputs for the rule names
    if (uatConfig.autoStopSchedule && stopRuleUat) {
      new cdk.CfnOutput(this, 'StopRuleUatName', {
        value: stopRuleUat.ruleName,
        description: 'The name of the CloudWatch Event Rule that stops the UAT EC2 instances.'
      });
    }

    if (stopStartRuleProd) {
      new cdk.CfnOutput(this, 'StopStartRuleProdName', {
        value: stopStartRuleProd.ruleName,
        description: 'The name of the CloudWatch Event Rule that stops and starts the PROD EC2 instances.'
      });
    }

    e2eTestRules.forEach((rule: events.Rule, index: number) => {
      new cdk.CfnOutput(this, `E2eTestRuleName${index}`, {
        value: rule.ruleName,
        description: `The name of the CloudWatch Event Rule that triggers the E2e test ${index}.`
      });
    }
