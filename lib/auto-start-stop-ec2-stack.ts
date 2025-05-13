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

export class AutoStartStopEc2Stack extends cdk.Stack {
  constructor (scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stackConfig = JSON.parse(fs.readFileSync('stack.config.json', {encoding: 'utf-8'}));
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
    if (uatConfig.autoStopSchedule) {
      const stopRuleUat = new events.Rule(this, 'StopRuleUat', {
        ruleName: `${id}-StopRuleUat`,
        schedule: events.Schedule.expression(uatConfig.autoStopSchedule)
      });

      stopRuleUat.addTarget(new targets.LambdaFunction(lambdaFn, {
        event: events.RuleTargetInput.fromObject({Region: uatConfig.region, Action: 'stop'})
      }));
    }

    // STOP/START EC2 instances rule for PROD (Friday night for AWS maintenance)
    let stopStartRuleProd: events.Rule | undefined = undefined;
    if (prodConfig.autoStopStartSchedule) {
      stopStartRuleProd = new events.Rule(this, 'StopStartRuleProd', {
        ruleName: `${id}-StopStartRuleProd`,
        schedule: events.Schedule.expression(prodConfig.autoStopStartSchedule)
      });

      stopStartRuleProd.addTarget(new targets.LambdaFunction(lambdaFn, {
        event: events.RuleTargetInput.fromObject({Region: prodConfig.region, Action: 'stopstart'})
      }));

      console.log('StopStartRuleProd name: ' + stopStartRuleProd.ruleName);
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

    // Route 53 Hosted Zones (assuming migration from GoDaddy)
    const roadmappartnersHostedZone = new route53.HostedZone(this, 'RoadmapPartnersHostedZone', {
      zoneName: 'roadmappartners.net'
    });

    const retirementtaxanalyzerHostedZone = new route53.HostedZone(this, 'RetirementTaxAnalyzerHostedZone', {
      zoneName: 'retirementtaxanalyzer.com'
    });

    // ACM Certificates with DNS validation via Route 53
    const roadmapPartnersCert = new acm.Certificate(this, 'RoadmapPartnersCertificate', {
      domainName: '*.roadmappartners.net',
      subjectAlternativeNames: ['roadmappartners.net'],
      validation: acm.CertificateValidation.fromDns(roadmappartnersHostedZone),
      // Note: For CloudFront, certificate must be in us-east-1.
      // Assuming for EC2 load balancer in us-west-1 for now.
    });

    const retirementTaxAnalyzerCert = new acm.Certificate(this, 'RetirementTaxAnalyzerCertificate', {
      domainName: 'retirementtaxanalyzer.com',
      validation: acm.CertificateValidation.fromDns(retirementtaxanalyzerHostedZone),
    });

    // Lambda function to verify DNS propagation and ACM validation
    const verifyDnsPropagationLambda = new lambda.Function(this, 'VerifyDnsPropagationLambda', {
      code: lambda.Code.fromInline(fs.readFileSync('lambda/verify-dns-propagation.py', {encoding: 'utf-8'})),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.PYTHON_3_9,
      environment: {
        // Add any necessary environment variables here, e.g., certificate ARNs
        // CERTIFICATE_ARNS: JSON.stringify([roadmapPartnersCert.certificateArn, retirementTaxAnalyzerCert.certificateArn])
      }
    });

    // Grant the Lambda permissions to interact with ACM, Route 53, and EventBridge
    verifyDnsPropagationLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'acm:DescribeCertificate',
        'route53:ListHostedZones',
        'route53:ListResourceRecordSets',
        'events:PutEvents' // Permission to put custom events
      ],
      resources: ['*'] // Consider restricting to specific resources if possible
    }));

    // EventBridge Rule to trigger DNS propagation verification periodically
    // This rule will trigger the Lambda every 15 minutes. Adjust the schedule as needed.
    new events.Rule(this, 'VerifyDnsPropagationRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.LambdaFunction(verifyDnsPropagationLambda, {
        // Pass certificate ARNs to the Lambda function
        event: events.RuleTargetInput.fromObject({
          certificate_arns: [roadmapPartnersCert.certificateArn, retirementTaxAnalyzerCert.certificateArn]
        })
      })]
    });

    // Lambda function to trigger certificate deployment via Systems Manager Run Command
    const deployCertificateLambda = new lambda.Function(this, 'DeployCertificateLambda', {
      code: lambda.Code.fromInline(`
import boto3
import os
import logging
import json

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ssm_client = boto3.client('ssm')

def main(event, context):
    """
    Lambda handler to trigger Ansible playbook execution via Systems Manager Run Command.
    Expected event input from EventBridge:
    {
        "certificate_arns": ["arn:aws:acm:us-west-1:123456789012:certificate/...", ...]
    }
    """
    logger.info("Received event: " + json.dumps(event))

    certificate_arns = event.get('detail', {}).get('certificate_arns', [])
    if not certificate_arns:
        logger.error("No certificate ARNs found in the event detail.")
        return {
            'statusCode': 400,
            'body': 'No certificate ARNs provided in event detail.'
        }

    # Assuming you have a way to map certificate ARNs to target EC2 instances
    # For simplicity, let's assume a fixed instance ID for now.
    # In a real scenario, you might look up instances based on tags or other criteria.
    target_instance_id = os.environ.get('TARGET_INSTANCE_ID')
    if not target_instance_id:
        logger.error("TARGET_INSTANCE_ID environment variable not set.")
        return {
            'statusCode': 500,
            'body': 'Target instance ID not configured.'
        }

    # Define the Systems Manager document and parameters
    # Assumes you have an Ansible playbook available on the EC2 instance
    # and a Systems Manager document configured to run Ansible playbooks.
    # You might need to create a custom SSM document or use AWS-RunShellScript
    # to execute the ansible-playbook command.
    ssm_document_name = 'AWS-RunShellScript' # Example SSM document
    ansible_playbook_path = '/home/ubuntu/your-repo/dev-ops/ansible/install-new-certs.yml' # Update with actual path
    ansible_inventory_path = '/home/ubuntu/your-repo/dev-ops/ansible/inventory' # Update with actual path
    # Pass certificate ARNs as extra vars to the Ansible playbook
    extra_vars = {
        'retirement_tax_analyzer_cert_arn': certificate_arns[0] if len(certificate_arns) > 0 else '',
        'roadmap_partners_cert_arn': certificate_arns[1] if len(certificate_arns) > 1 else ''
    }
    ansible_command = f'ansible-playbook {ansible_playbook_path} -i {ansible_inventory_path} --extra-vars \'{json.dumps(extra_vars)}\''


    try:
        response = ssm_client.send_command(
            InstanceIds=[target_instance_id],
            DocumentName=ssm_document_name,
            Parameters={'commands': [ansible_command]},
            Comment='Automated certificate deployment via ACM renewal'
        )
        command_id = response['Command']['CommandId']
        logger.info(f"SSM Run Command sent successfully with Command ID: {command_id}")
        return {
            'statusCode': 200,
            'body': f'SSM Run Command triggered: {command_id}'
        }
    except Exception as e:
        logger.error(f"Error sending SSM Run Command: {e}")
        return {
            'statusCode': 500,
            'body': f'Error triggering SSM Run Command: {e}'
        }
      `),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(600), // Adjust timeout as needed for Ansible execution
      runtime: lambda.Runtime.PYTHON_3_9,
      environment: {
        TARGET_INSTANCE_ID: prodConfig.instanceId // Pass the production instance ID
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
    new events.Rule(this, 'AcmValidationSuccessRule', {
      eventPattern: {
        source: ['custom.certificate.automation'],
        detailType: ['ACM Certificate Validation Success'],
        // You could add more specific detail filtering here if needed
      },
      targets: [new targets.LambdaFunction(deployCertificateLambda, {
        // Pass the event detail to the target Lambda
        event: events.RuleTargetInput.fromEventPath('$.detail')
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
          { "hostname": "retirementtaxanalyzer.com", "port": 443 },
          { "hostname": "roadmappartners.net", "port": 443 },
          { "hostname": "uat.roadmappartners.net", "port": 443 } // Include UAT if needed
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


    // EventBridge Rule for ACM Certificate Approaching Expiration
    new events.Rule(this, 'AcmCertificateExpirationRule', {
      eventPattern: {
        source: ['aws.acm'],
        detailType: ['ACM Certificate State Change'],
        detail: {
          certificateArn: [roadmapPartnersCert.certificateArn, retirementTaxAnalyzerCert.certificateArn],
          domainName: ['*.roadmappartners.net', 'retirementtaxanalyzer.com'],
          state: ['EXPIRATION_WARNING', 'EXPIRED'] // Trigger on warning and expiration
        }
      },
      targets: [new targets.SnsTopic(certificateAlertTopic)]
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

    new cdk.CfnOutput(this, 'CertificateAlertTopicArn', {
      value: certificateAlertTopic.topicArn,
      description: 'The ARN of the SNS topic for certificate expiration alerts.'
    });

    new cdk.CfnOutput(this, 'RoadmapPartnersCertificateArn', {
      value: roadmapPartnersCert.certificateArn,
      description: 'The ARN of the ACM certificate for *.roadmappartners.net.'
    });

    new cdk.CfnOutput(this, 'RetirementTaxAnalyzerCertificateArn', {
      value: retirementTaxAnalyzerCert.certificateArn,
      description: 'The ARN of the ACM certificate for retirementtaxanalyzer.com.'
    });

    new cdk.CfnOutput(this, 'RoadmapPartnersHostedZoneId', {
      value: roadmappartnersHostedZone.hostedZoneId,
      description: 'The ID of the Route 53 Hosted Zone for roadmappartners.net.'
    });

    new cdk.CfnOutput(this, 'RetirementTaxAnalyzerHostedZoneId', {
      value: retirementtaxanalyzerHostedZone.hostedZoneId,
      description: 'The ID of the Route 53 Hosted Zone for retirementtaxanalyzer.com.'
    });

    new cdk.CfnOutput(this, 'VerifyDnsPropagationLambdaArn', {
      value: verifyDnsPropagationLambda.functionArn,
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


    // Add outputs for the rule names
    if (uatConfig.autoStopSchedule) {
      new cdk.CfnOutput(this, 'StopRuleUatName', {
        value: `${id}-StopRuleUat`,
        description: 'The name of the CloudWatch Event Rule that stops the UAT EC2 instances.'
      });
    }

    if (stopStartRuleProd) {
      new cdk.CfnOutput(this, 'StopStartRuleProdName', {
        value: `${id}-StopStartRuleProd`,
        description: 'The name of the CloudWatch Event Rule that stops and starts the PROD EC2 instances.'
      });
    }

    e2eTestRules.forEach((rule: events.Rule, index: number) => {
      new cdk.CfnOutput(this, `E2eTestRuleName${index}`, {
        value: rule.ruleName,
        description: `The name of the CloudWatch Event Rule that triggers the E2E test ${index}.`
      });
    });
  }
}
