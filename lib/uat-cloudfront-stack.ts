import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export class UatCloudFrontStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'RoadmapPartnersWildcardCertificate',
      'arn:aws:acm:us-east-1:865664998993:certificate/a3c6ca37-90df-4d09-aecb-183a06dc0650'
    );

    const distribution = new cloudfront.Distribution(this, 'UatDistribution', {
      comment: 'uat.roadmappartners.net - UAT CloudFront front door for ACM migration',
      defaultBehavior: {
        origin: new origins.HttpOrigin('ec2-54-177-161-104.us-west-1.compute.amazonaws.com', {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          readTimeout: Duration.seconds(30),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
      },
      domainNames: ['uat.roadmappartners.net'],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
    });

    new CfnOutput(this, 'UatDistributionId', {
      value: distribution.distributionId,
    });

    new CfnOutput(this, 'UatDistributionDomainName', {
      value: distribution.distributionDomainName,
    });
  }
}
