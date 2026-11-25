# Roadmap outbound email

- Provider and transport: Amazon SES v2 API (`SendEmail` with raw MIME content).
- Region: `us-west-1`.
- From address: `support@retirementtaxanalyzer.com`.
- Application mail routing (`roadmap-website/src/main/resources/mail.properties`): illustration address `Whaleteamsix@pacificlife.com`; test BCC `test@bizkite.net`; technical support `mark@bizkite.net`.
- Configuration set: `prs-default`.
- Runtime identity: the EC2 application instance role `AmazonSSMRoleForInstancesQuickSetup`, currently shared by UAT and PROD.
- Permission: `ses:SendEmail`, limited to the `support@retirementtaxanalyzer.com` sender identity and `prs-default` configuration set, with an exact `ses:FromAddress` condition.
- SMTP usernames/passwords and Secrets Manager mail secrets are not used by the application.

The `RoadmapSesOutboundMailStack` records these settings as CloudFormation outputs and manages the application role policy. The SES identity and configuration set already exist in AWS and are referenced by the stack rather than recreated.

Deploy with `make deploy-ses-mail` from this repository. The matching application settings are `aws.ses.region`, `aws.ses.configuration.set`, and `mail.support` in `roadmap-website/src/main/resources/mail.properties`.
