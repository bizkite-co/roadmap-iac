import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export class ProdCloudFrontStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'RoadmapPartnersWildcardCertificate',
      'arn:aws:acm:us-east-1:865664998993:certificate/a3c6ca37-90df-4d09-aecb-183a06dc0650'
    );

    const distribution = new cloudfront.Distribution(this, 'ProdDistribution', {
      comment: 'roadmappartners.net - PROD CloudFront front door for ACM migration',
      defaultBehavior: {
        // Public traffic terminates on the production ALB. Deploying this
        // stack must keep that origin. The ALB and its us-west-1 certificate
        // were created outside this stack; do not point this origin back at
        // the EC2 public DNS.
        origin: new origins.HttpOrigin('roadmap-prod-origin-1785733092.us-west-1.elb.amazonaws.com', {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          readTimeout: Duration.seconds(30),
          keepaliveTimeout: Duration.seconds(5),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
      },
      domainNames: ['roadmappartners.net'],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
    });

    new CfnOutput(this, 'ProdDistributionId', {
      value: distribution.distributionId,
    });

    new CfnOutput(this, 'ProdDistributionDomainName', {
      value: distribution.distributionDomainName,
    });
  }
}
