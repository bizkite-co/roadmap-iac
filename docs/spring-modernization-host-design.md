# Spring modernization host design

Status: implementation in progress; no AWS resources have been deployed. This stack does not change the existing UAT/PROD pipeline.

## Goal

Create a separate, reproducible host for the Spring and passkey modernization work. Keep current `PRS-UAT`, `PRS-PROD`, their DNS, and their deployments unchanged until the replacement host passes application and integration checks.

## Capacity and placement

- Region: `us-west-1`, matching the current environments.
- EC2 size: `m7i.large` (2 vCPU, 8 GiB).
- Expected on-demand Linux compute price at the 2026-11-20 AWS Price List query: about $85.85 per 730-hour month, before EBS, network, public IPv4, and logging. This is about $0.44/month more than the current `m4.large` compute rate.
- Name tag: `PRS-SPRING-UPGRADE`.
- Proposed isolated hostname: `spring-upgrade.roadmappartners.net`; do not create DNS or route traffic as part of initial host provisioning.
- Use Canonical Ubuntu Server 24.04 LTS selected through its public SSM AMI parameter, encrypted EBS, SSM access, and no SSH ingress. Attach only the existing network placement required for this isolated host.

## Runtime compatibility

The app currently targets Java 17 and is a WAR using Spring Framework 4.2.6, Spring Security 3.2.10, `javax.servlet`, Thymeleaf Spring 4, Spring Data JPA 1.6.6, and Hibernate 4.3.1. Those APIs do not constitute the modern Spring baseline.

Apache Tomcat 9 is the compatibility bridge for the current WAR, but upstream support ends on 2027-03-31. Treat it as a temporary validation runtime, not the modernization host's long-term target. The target stack should validate the upgraded app on Java 17 and Tomcat 10.1 (Jakarta Servlet). Keep the current WAR and target runtime isolated during the transition; do not silently point the existing deployment scripts at the new host.

Ubuntu 24.04 is selected because the current hosts already run Ubuntu and the official repositories provide MySQL 8.0. The live hosts have MySQL 8.0.42; Ubuntu 24.04 currently offers the patched 8.0.46 package. AWS lists Ubuntu Server 24.04 as tested with CodeDeploy agent 2.0.x and later.

## Deployment and operations

- Add a separate CDK app/stack entry point in this repository; leave the default `cdk.json` app and existing E2E stack alone.
- Provide explicit synth, deploy, status, and destroy Make targets for the named modernization stack. Deploy/destroy commands must use the selected AWS profile and `us-west-1` explicitly.
- Target only the `PRS-SPRING-UPGRADE` instance from CodeDeploy. Do not broaden the current `PRS-UAT` or `PRS-PROD` deployment groups or pipeline stages.
- Keep secrets out of AMIs, user data, and source. Resolve runtime settings through the documented Secrets Manager / IAM role path once the app's exact secret contract has been inventoried.
- Bootstrap logs and application logs to CloudWatch; retain an operator-controlled rollback to the current WAR/runtime and an explicit cleanup path for the temporary host.
- Do not deploy the application until the database restore source, secrets, and SES/S3/IAM requirements are confirmed. The host stack itself is isolated and has no inbound rules or DNS.

## Validation gate before Spring changes

Deploy the current WAR only if it can run on the temporary compatibility runtime. Then verify database connectivity, SES sending, S3 report storage, scheduled jobs, TLS/routing, CloudWatch logs, health checks, and rollback. Validate the upgraded WAR separately on Tomcat 10.1 before any production cutover.

## Evidence and constraints

- Current host sizing, utilization sample, and rate comparison are recorded in the task-agent host provisioning task's `environment-identity-and-right-sizing-2026-11-20.md`.
- App runtime versions were read from `build.gradle` and its `javax.servlet` imports on 2026-11-20.
- AWS CodeDeploy lists Ubuntu Server 24.04 as tested for agent 2.0.x and later: https://docs.aws.amazon.com/codedeploy/latest/userguide/codedeploy-agent.html
- Canonical public Ubuntu 24.04 AMI metadata was resolved in `us-west-1`: the root device is `/dev/sda1`.
- [Ubuntu 24.04 MySQL Server package](https://packages.ubuntu.com/noble/mysql-server) currently provides MySQL 8.0.46.
- Apache announced Tomcat 9.0.x end of support as 2027-03-31; current Tomcat 9.x and 10.1.x releases are documented at https://tomcat.apache.org/
