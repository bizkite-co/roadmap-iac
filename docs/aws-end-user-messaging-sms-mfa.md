# AWS End User Messaging SMS MFA

UAT and PROD use separate EC2 roles (`RoadmapUatInstanceRole` and `RoadmapProdInstanceRole`). Each app uses the AWS SDK default credential chain; no access key belongs in application properties or Secrets Manager. SMS is restricted to US numbers and user-initiated enrollment with consent.

## UAT

- Notify configuration `notify-49f77dd7dbd04b89a6175833cc613c64` (`Roadmap UAT`) is `ACTIVE`, Basic tier, US SMS, managed OTP template `notify-code-verification-english-001`.
- `RoadmapUatAwsSmsMfaStack` grants only `sms-voice:SendNotifyTextMessage`, scoped to that configuration ARN, on `RoadmapUatInstanceRole`.
- App version `1.0.8.448` is deployed. A consenting UAT user completed enrollment and received/verified a real SMS OTP.

## PROD

- Notify configuration `notify-247b108582bd4b759babbf5302624959` (`Roadmap`) is `ACTIVE`, Basic tier, US SMS, managed OTP template `notify-code-verification-english-001`.
- `RoadmapProdAwsSmsMfaStack` is `CREATE_COMPLETE`. It grants only `sms-voice:SendNotifyTextMessage`, scoped to the PROD Notify configuration ARN, on `RoadmapProdInstanceRole`.
- The application has not yet been deployed or runtime-enabled in PROD. The email and SMS MFA schema tables have been prepared; PROD app release remains pending.

## Deploy/update the IAM policy

The AWS account is not CDK-bootstrapped. The two CDK stacks are asset-free and deploy through the CloudFormation wrapper:

```sh
AWS_PROFILE=westmonroe-support ./scripts/deploy-sms-notify-iam.sh uat notify-<uat-configuration-id>
AWS_PROFILE=westmonroe-support ./scripts/deploy-sms-notify-iam.sh prod notify-<prod-configuration-id>
```

The wrapper checks the AWS account and environment, synthesizes the selected stack, removes CDK's unused bootstrap-version parameter/rule, and deploys the IAM policy through CloudFormation.

The monthly Notify spend cap remains $1; no limit increase was requested. Each delivered message incurs AWS Notify and country transport charges. Notify Basic provides an AWS-managed sender and approved OTP template; it does not replace consent or required disclosures. The separate Uptime 10DLC campaign must not be reused for MFA.
