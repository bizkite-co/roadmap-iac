# Spring modernization host design

Status (2026-11-27): AWS Organizations OU `UAT` (`ou-qhuj-c6th6s4k`) contains member account `Roadmap UAT` (`678086717998`). `RoadmapSpringModernizationHostStack` now runs there in `us-west-1` as instance `i-08c7938310f2563ec`. Ubuntu 24.04, Tomcat 11.0.29, Java 17, MySQL 8.0.46, Apache, CodeDeploy, and CloudWatch Agent are configured. The local `prs_dev` database contains only the checked-in test schema; no customer data was copied. UAT and PROD websites were not changed.

The host stack and WAR are deployed in the new member account. Flyway completes, and the public `/roadmap/about.html` route returns HTTP 200. The unauthenticated `/roadmap/login.html` route currently returns a 302 back to itself; investigate and fix this Spring Security/login behavior before treating the upgraded app as usable. The CodeDeploy health hook now probes the public About page instead of assuming the login route returns HTTP 200.

Local UAT credentials are stored in the ignored, mode-600 `roadmap-website/uat.env` file. `direnv` loads them only on the `uat`, `spring-modernization`, or `spring-upgrade` branch in the website repo. The credentials belong to the account-local `roadmap-uat-developer` IAM user; they are not a profile scoped to an OU.

## Goal

Create a separate, reproducible host for the Spring and passkey modernization work. Keep current `PRS-UAT`, `PRS-PROD`, their DNS, and their deployments unchanged until the replacement host passes application and integration checks.

## Capacity and placement

- AWS placement: member account `678086717998` in the `UAT` OU; region `us-west-1`, matching the current environments.
- EC2 size: `m7i.large` (2 vCPU, 8 GiB).
- Expected on-demand Linux compute price at the 2026-11-20 AWS Price List query: about $85.85 per 730-hour month, before EBS, network, public IPv4, and logging. This is about $0.44/month more than the current `m4.large` compute rate.
- Name tag: `PRS-SPRING-UPGRADE`.
- Proposed isolated hostname: `spring-upgrade.roadmappartners.net`; do not create DNS or route traffic as part of initial host provisioning.
- Use Canonical Ubuntu Server 24.04 LTS selected through its public SSM AMI parameter, encrypted EBS, SSM access, and no SSH ingress. The stack uses the account's default VPC and public subnet for outbound access; its security group has no inbound rules.

## Runtime compatibility

The application branch targets Java 17 and a traditional WAR using Spring Framework 7.1, Spring Security 7.2, Spring Data JPA 4.2, Hibernate 7.4, Jakarta Servlet 6.1, and Thymeleaf 3.1. Current UAT and PROD remain on the known-good existing runtime.

The modernization host must use Apache Tomcat 11.0.x for Servlet 6.1. The current IaC baseline pins Tomcat 11.0.29 and verifies the official archive's SHA-512 digest. Install it at `/opt/tomcat/apache-tomcat-<version>` and keep `/opt/tomcat/latest` as the stable deploy path used by the Roadmap WAR's existing Makefile deployment workflow. Keep current UAT/PROD untouched during the transition.

Ubuntu 24.04 is selected because the current hosts already run Ubuntu and the official repositories provide MySQL 8.0. The live hosts have MySQL 8.0.42; Ubuntu 24.04 currently offers the patched 8.0.46 package. AWS lists Ubuntu Server 24.04 as tested with CodeDeploy agent 2.0.x and later.

## Deployment and operations

- Add a separate CDK app/stack entry point in this repository; leave the default `cdk.json` app and existing E2E stack alone. The modernization stack creates its CodeDeploy application and deployment group in the UAT member account.
- Provide explicit synth, deploy, status, and destroy Make targets for the named modernization stack. Deploy/destroy commands use the account credentials loaded from `uat.env` and `us-west-1` explicitly.
- Target only the `PRS-SPRING-UPGRADE` instance from CodeDeploy. Do not broaden the current `PRS-UAT` or `PRS-PROD` deployment groups or pipeline stages.
- Keep secrets out of AMIs, user data, and source. Resolve runtime settings through the documented Secrets Manager / IAM role path once the app's exact secret contract has been inventoried.
- Bootstrap logs and application logs to CloudWatch; retain an operator-controlled rollback to the current WAR/runtime and an explicit cleanup path for the temporary host.
- Do not connect this host to production data or enable SES. The instance role now has no SES send permission and no write access to the shared `prsreports` bucket. Keep the local test DB and email suppression for modernization tests. The host has no inbound rules or DNS.

## Validation gate before Spring changes

The first WAR deployment identified a missing `org.flywaydb:flyway-mysql` module at runtime; that dependency is now present. The empty test schema also had invalid zero-date defaults for `Trial_End` and `Last_Login`; the fixture now matches the values from the existing cleanup migration. Spring Data then attempted to instantiate the generic `LegacyJpaRepository<T, ID>` as a concrete repository; the interface is now marked `@NoRepositoryBean`. These changes allowed Flyway to complete and the public About route to return 200. The remaining login redirect loop must be fixed and verified before considering the modernization host ready. Then validate login, runtime compatibility, CloudWatch logs, health checks, and rollback before any UAT website or production cutover.

## Evidence and constraints

- Current host sizing, utilization sample, and rate comparison are recorded in the task-agent host provisioning task's `environment-identity-and-right-sizing-2026-11-20.md`.
- App runtime versions were read from `build.gradle` and its `javax.servlet` imports on 2026-11-20.
- AWS CodeDeploy lists Ubuntu Server 24.04 as tested for agent 2.0.x and later: https://docs.aws.amazon.com/codedeploy/latest/userguide/codedeploy-agent.html
- Canonical public Ubuntu 24.04 AMI metadata was resolved in `us-west-1`: the root device is `/dev/sda1`.
- [Ubuntu 24.04 MySQL Server package](https://packages.ubuntu.com/noble/mysql-server) currently provides MySQL 8.0.46.
- [Tomcat 11 migration guide](https://tomcat.apache.org/migration-11.0.html) — Java 17 minimum and Servlet 6.1 support.
- [Tomcat 11 version matrix](https://tomcat.apache.org/whichversion) — current supported release branch and specification level.
