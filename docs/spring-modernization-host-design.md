# Spring modernization host design

Status: isolated host IaC was deployed, converged, and then destroyed on 2026-11-21. The current branch updates its baseline to Tomcat 11; no Spring modernization host is presently running. This stack does not change the existing UAT/PROD pipeline.

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

The application branch targets Java 17 and a traditional WAR using Spring Framework 7.1, Spring Security 7.2, Spring Data JPA 4.2, Hibernate 7.4, Jakarta Servlet 6.1, and Thymeleaf 3.1. Current UAT and PROD remain on the known-good existing runtime.

The modernization host must use Apache Tomcat 11.0.x for Servlet 6.1. The current IaC baseline pins Tomcat 11.0.29 and verifies the official archive's SHA-512 digest. Install it at `/opt/tomcat/apache-tomcat-<version>` and keep `/opt/tomcat/latest` as the stable deploy path used by the Roadmap WAR's existing Makefile deployment workflow. Keep current UAT/PROD untouched during the transition.

Ubuntu 24.04 is selected because the current hosts already run Ubuntu and the official repositories provide MySQL 8.0. The live hosts have MySQL 8.0.42; Ubuntu 24.04 currently offers the patched 8.0.46 package. AWS lists Ubuntu Server 24.04 as tested with CodeDeploy agent 2.0.x and later.

## Deployment and operations

- Add a separate CDK app/stack entry point in this repository; leave the default `cdk.json` app and existing E2E stack alone.
- Provide explicit synth, deploy, status, and destroy Make targets for the named modernization stack. Deploy/destroy commands must use the selected AWS profile and `us-west-1` explicitly.
- Target only the `PRS-SPRING-UPGRADE` instance from CodeDeploy. Do not broaden the current `PRS-UAT` or `PRS-PROD` deployment groups or pipeline stages.
- Keep secrets out of AMIs, user data, and source. Resolve runtime settings through the documented Secrets Manager / IAM role path once the app's exact secret contract has been inventoried.
- Bootstrap logs and application logs to CloudWatch; retain an operator-controlled rollback to the current WAR/runtime and an explicit cleanup path for the temporary host.
- Do not deploy the application until the database restore source, secrets, and SES/S3/IAM requirements are confirmed. The host stack itself is isolated and has no inbound rules or DNS.

## Validation gate before Spring changes

Deploy the upgraded WAR only after the isolated host is configured. Then verify database connectivity, SES sending (suppressed by default), S3 report storage, scheduled jobs, TLS/routing, CloudWatch logs, health checks, and rollback on Tomcat 11 before any UAT or production cutover.

## Evidence and constraints

- Current host sizing, utilization sample, and rate comparison are recorded in the task-agent host provisioning task's `environment-identity-and-right-sizing-2026-11-20.md`.
- App runtime versions were read from `build.gradle` and its `javax.servlet` imports on 2026-11-20.
- AWS CodeDeploy lists Ubuntu Server 24.04 as tested for agent 2.0.x and later: https://docs.aws.amazon.com/codedeploy/latest/userguide/codedeploy-agent.html
- Canonical public Ubuntu 24.04 AMI metadata was resolved in `us-west-1`: the root device is `/dev/sda1`.
- [Ubuntu 24.04 MySQL Server package](https://packages.ubuntu.com/noble/mysql-server) currently provides MySQL 8.0.46.
- [Tomcat 11 migration guide](https://tomcat.apache.org/migration-11.0.html) — Java 17 minimum and Servlet 6.1 support.
- [Tomcat 11 version matrix](https://tomcat.apache.org/whichversion) — current supported release branch and specification level.
