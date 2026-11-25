import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';

import fs = require('fs');

interface CertificateAutomationConstructProps {
  certificateAlertTopic: sns.ITopic;
}

export class CertificateAutomationConstruct extends Construct {
  public readonly roadmapPartnersCertificateArn: string;
  public readonly retirementTaxAnalyzerCertificateArn: string;
  public readonly verifyDnsPropagationLambdaArn: string;

  constructor(scope: Construct, id: string, props: CertificateAutomationConstructProps) {
    super(scope, id);

    // NOTE: retirementtaxanalyzer.com cert was manually created on 2026-06-12 during a live
    // incident fix (expired GoDaddy cert). Import it here so CDK does not attempt to create
    // a duplicate. DNS validation CNAMEs are already in Route 53 hosted zone Z0793299AG2CLVJ6NTM5.
    const retirementTaxAnalyzerCert = acm.Certificate.fromCertificateArn(
      this,
      'RetirementTaxAnalyzerCertificate',
      'arn:aws:acm:us-east-1:865664998993:certificate/e41aabd9-731c-48f0-923b-8cb54906703f'
    );

    // NOTE: *.roadmappartners.net is still a GoDaddy-issued cert installed directly on the
    // EC2 instance (renewed 2026-06-12, expires 2026-11-25). This ACM cert definition will
    // request a new ACM-managed cert when the stack is deployed — coordinate the Apache
    // install-new-certs.yml Ansible playbook to switch over before the GoDaddy cert expires.
    const roadmapPartnersCert = new acm.Certificate(this, 'RoadmapPartnersCertificate', {
      domainName: '*.roadmappartners.net',
      subjectAlternativeNames: ['roadmappartners.net'],
      validation: acm.CertificateValidation.fromDns(), // Route 53 hosted zone Z04879222BU448TUVC86H
    });

    this.roadmapPartnersCertificateArn = roadmapPartnersCert.certificateArn;
    this.retirementTaxAnalyzerCertificateArn = retirementTaxAnalyzerCert.certificateArn;

    // Lambda function to verify DNS propagation and ACM validation
    const verifyDnsPropagationLambda = new lambda.Function(this, 'VerifyDnsPropagationLambda', {
      code: lambda.Code.fromInline(fs.readFileSync('lambda/verify-dns-propagation.py', {encoding: 'utf-8'})),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.PYTHON_3_9,
      environment: {
        // Pass certificate ARNs to the Lambda function
        CERTIFICATE_ARNS: JSON.stringify([this.roadmapPartnersCertificateArn, this.retirementTaxAnalyzerCertificateArn])
      }
    });

    this.verifyDnsPropagationLambdaArn = verifyDnsPropagationLambda.functionArn;

    // Grant the Lambda permissions to interact with ACM and EventBridge
    verifyDnsPropagationLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'acm:DescribeCertificate',
        'events:PutEvents' // Permission to put custom events
      ],
      resources: ['*'] // Consider restricting to specific resources if possible
    }));

    // EventBridge Rule to trigger DNS propagation verification periodically
    new events.Rule(this, 'VerifyDnsPropagationRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.LambdaFunction(verifyDnsPropagationLambda, {
        // Pass certificate ARNs to the Lambda function
        event: events.RuleTargetInput.fromObject({
          certificate_arns: [this.roadmapPartnersCertificateArn, this.retirementTaxAnalyzerCertificateArn]
        })
      })]
    });

    // EventBridge Rule for ACM Certificate Approaching Expiration
    new events.Rule(this, 'AcmCertificateExpirationRule', {
      eventPattern: {
        source: ['aws.acm'],
        detailType: ['ACM Certificate State Change'],
        detail: {
          certificateArn: [this.roadmapPartnersCertificateArn, this.retirementTaxAnalyzerCertificateArn],
          domainName: ['*.roadmappartners.net', 'retirementtaxanalyzer.com'],
          state: ['EXPIRATION_WARNING', 'EXPIRED'] // Trigger on warning and expiration
        }
      },
      targets: [new targets.SnsTopic(props.certificateAlertTopic)]
    });
  }
}