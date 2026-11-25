# AWS End User Messaging SMS MFA

UAT and PROD use separate EC2 roles (`RoadmapUatInstanceRole` and `RoadmapProdInstanceRole`). Each app uses the AWS SDK default credential chain; no access key belongs in application properties or Secrets Manager. SMS is restricted to US numbers and user-initiated enrollment with consent.

## UAT

- Notify configuration `notify-49f77dd7dbd04b89a6175833cc613c64` (`Roadmap UAT`) is `ACTIVE`, Basic tier, US SMS, managed OTP template `notify-code-verification-english-001`.
- `RoadmapUatAwsSmsMfaStack` grants only `sms-voice:SendNotifyTextMessage`, scoped to that configuration ARN, on `RoadmapUatInstanceRole`.
- App version `1.0.8.448` is deployed. A consenting UAT user completed enrollment and received/verified a real SMS OTP.

## PROD

- Notify configuration `notify-247b108582bd4b759babbf5302624959` (`Roadmap`) is `ACTIVE`, Basic tier, US SMS, managed OTP template `notify-code-verification-english-001`.
- `RoadmapProdAwsSmsMfaStack` is `CREATE_COMPLETE`. It grants only `sms-voice:SendNotifyTextMessage`, scoped to the PROD Notify configuration ARN, on `RoadmapProdInstanceRole`.
- The application is deployed at `1.0.8.449`; SMS MFA is available as an optional method, and global enforcement remains off.
- AWS approved the `NotifyMonthlySpend` service quota request `fb900c43d0524f00a043504d5dc8c19erOOW0MYG`. The account-enforced Notify monthly spend cap is now **$20**.
- `RoadmapNotifySpendAlarmStack` is deployed. The deployment helper reads AWS's current enforced Notify spend limit and sets the alarm threshold to 60%. At the current $20 cap, the threshold is $12. The alarm watches `AWS/SMSVoice:NotifyMessageMonthlySpend` and notifies the existing `site-alarm-topic`. It is currently `OK`; its first observed monthly spend datapoint was about $0.11. Rerun the deployment helper after changing the cap; no recurring Lambda or schedule is used.
- Advanced-tier request `registration-2cbdff48ed8642a7b2ce5a17628000a8` was submitted on November 24, 2026 and is `REVIEWING`; the Notify configuration reports `PENDING_UPGRADE`. The registration is limited to US destinations and projects 10 messages/day with 2 messages/second peak throughput. Its evidence attachment `attachment-c552d24742b7407b92f34ad30d6e0f8f` is an image generated from the current UAT form wording and styling; it shows the unchecked consent box, phone input, sender disclosure, and policy links without user data.

## Deploy/update the IAM policy

The AWS account is not CDK-bootstrapped. The two CDK stacks are asset-free and deploy through the CloudFormation wrapper:

```sh
AWS_PROFILE=westmonroe-support ./scripts/deploy-sms-notify-iam.sh uat notify-<uat-configuration-id>
AWS_PROFILE=westmonroe-support ./scripts/deploy-sms-notify-iam.sh prod notify-<prod-configuration-id>
```

The wrapper checks the AWS account and environment, synthesizes the selected stack, removes CDK's unused bootstrap-version parameter/rule, and deploys the IAM policy through CloudFormation.

Notify pricing starts at $0.045 per message plus the applicable country transport charge. AWS approved a $20 monthly Notify cap; the CloudWatch alarm warns at $12. Advanced review is expected to take 3–5 business days according to AWS. Notify Basic provides an AWS-managed sender and approved OTP template; it does not replace consent or required disclosures. The separate Uptime 10DLC campaign must not be reused for MFA.

The PROD spend alarm is defined in `lib/notify-spend-alarm-stack.ts` and `bin/notify-spend-alarm.ts`; use `make notify-spend-alarm-deploy` or `scripts/deploy-notify-spend-alarm.sh` to deploy it. The helper reads the current enforced Notify cap, calculates 60%, and passes that threshold into the synthesized CloudFormation alarm. Rerun it after changing the cap. The stack is asset-free and the helper removes CDK's unused bootstrap metadata because this account is not CDK-bootstrapped.
