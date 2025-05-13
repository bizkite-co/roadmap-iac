# AWS ACM Certificate Rollover Automation Guide

This document explains the automated certificate rollover process implemented using AWS Certificate Manager (ACM), EventBridge, Lambda, and Ansible. It also outlines the remaining manual steps required for the annual certificate renewal.

## Implemented Automation

The following components have been implemented as part of the automated certificate rollover:

1.  **AWS Certificate Manager (ACM):** Public ACM certificates for `*.roadmappartners.net` and `retirementtaxanalyzer.com` are defined in the CDK stack. These certificates are configured for DNS validation. ACM will automatically handle certificate renewals as long as the DNS validation records remain in place.
2.  **Route 53 Hosted Zones:** Route 53 Hosted Zones for `roadmappartners.net` and `retirementtaxanalyzer.com` are defined in the CDK stack. This assumes that DNS hosting for these domains has been migrated from GoDaddy to Route 53 (Option B from the plan).
3.  **SNS Topic for Alerts:** An SNS topic (`CertificateAlertTopic`) is created in the CDK stack to receive notifications related to certificate expiration and health check failures.
4.  **EventBridge Rule for Expiration Alerts:** An EventBridge rule (`AcmCertificateExpirationRule`) is configured to trigger when ACM certificates are approaching expiration (`EXPIRATION_WARNING`) or have expired (`EXPIRED`). This rule sends a notification to the `CertificateAlertTopic`.
5.  **Lambda Function for DNS Validation Verification:** A Lambda function (`VerifyDnsPropagationLambda`) is deployed to periodically check the validation status of the ACM certificates using the AWS SDK.
6.  **EventBridge Rule for DNS Validation Verification:** An EventBridge rule (`VerifyDnsPropagationRule`) is scheduled to trigger the `VerifyDnsPropagationLambda` function every 15 minutes. This Lambda checks if the ACM certificates have been successfully validated after issuance or renewal.
7.  **Lambda Function for Certificate Deployment:** A Lambda function (`DeployCertificateLambda`) is deployed to trigger the Ansible playbook (`dev-ops/ansible/install-new-certs.yml`) via AWS Systems Manager Run Command. This Lambda is responsible for fetching the certificate content from ACM and deploying it to the EC2 instances.
8.  **EventBridge Rule for Deployment Trigger:** A custom EventBridge rule (`AcmValidationSuccessRule`) is configured to listen for a custom event (`ACM Certificate Validation Success`) emitted by the `VerifyDnsPropagationLambda` function. When this event is received (indicating successful ACM validation), this rule triggers the `DeployCertificateLambda` to deploy the new certificate.
9.  **Ansible Playbook Update:** The `dev-ops/ansible/install-new-certs.yml` playbook has been modified to use the AWS CLI to fetch the certificate body and chain from ACM based on the certificate ARNs passed as extra variables. It then updates the Apache SSL configuration on the target EC2 instances.
10. **Lambda Function for Certificate Health Checks:** A Lambda function (`CheckCertificateHealthLambda`) is deployed to perform periodic checks on the live certificates served by the web server on the EC2 instances. It checks the certificate expiry date and sends alerts to the SNS topic if the certificate is expiring soon or if the check fails.
11. **EventBridge Rule for Health Checks:** An EventBridge rule (`CertificateHealthCheckRule`) is scheduled to trigger the `CheckCertificateHealthLambda` function daily.

## Remaining Manual Steps and Timeline

While significant automation has been implemented, the following manual steps are still required for the annual certificate rollover:

1.  **DNS Migration to Route 53 (One-time setup):** If the domains (`roadmappartners.net`, `retirementtaxanalyzer.com`) are still hosted on GoDaddy, their DNS must be migrated to AWS Route 53. This involves creating Hosted Zones in Route 53 (already defined in the CDK stack) and updating the domain's nameservers at GoDaddy to point to the Route 53 nameservers.
    *   **When to do:** This should be done well in advance of the certificate expiration date, ideally as soon as possible to leverage ACM's automatic renewal.
2.  **Initial ACM Certificate Request (One-time setup):** Although the CDK defines the ACM certificates, the initial request and validation process needs to be completed through the AWS Management Console or AWS CLI/SDK after the CDK stack is deployed. Since DNS validation via Route 53 is configured, ACM will provide CNAME records that need to be added to the Route 53 Hosted Zones. The CDK setup for ACM with Route 53 validation should handle the creation of these CNAME records automatically upon deployment.
    *   **When to do:** After deploying the CDK stack that includes the ACM certificates and Route 53 Hosted Zones. Monitor the certificate status in ACM until it shows "Issued".
3.  **Verify Initial Deployment:** After the initial ACM certificate is issued and the `AcmValidationSuccessRule` triggers the `DeployCertificateLambda`, verify that the new certificates have been successfully deployed to the EC2 instances and are being served correctly. Use the certificate health check Lambda or manual checks (e.g., `openssl s_client`) to confirm.
    *   **When to do:** After the initial ACM certificate is issued and the automated deployment is triggered.
4.  **Monitor SNS Alerts:** Ensure that the SNS topic for certificate alerts is configured with appropriate subscriptions (e.g., email addresses) so that administrators receive notifications about impending expirations or health check failures.
    *   **When to do:** As soon as the CDK stack is deployed.
5.  **Monitor Automated Renewal:** ACM automatically attempts to renew certificates before they expire. Monitor the certificate status in ACM as the expiration date approaches to ensure the automated renewal is successful. The `VerifyDnsPropagationRule` and `AcmValidationSuccessRule` should handle the validation and deployment of the renewed certificate.
    *   **When to do:** Periodically as the certificate expiration date approaches (e.g., starting 60 days before expiration).
6.  **Manual Intervention (if needed):** In case of any issues with automated renewal or deployment, manual intervention may be required. The existing manual process using Ansible playbooks (`dev-ops/ansible/install-new-certs.yml` and `dev-ops/ansible/rollback-certs.yml`) can still be used as a fallback, but the `install-new-certs.yml` playbook now expects certificate ARNs as input to fetch from ACM.
    *   **When to do:** If automated alerts indicate a problem or if monitoring shows that renewal/deployment failed.

## Annual Process Summary (Starting Next Year)

Assuming DNS is migrated to Route 53 and the initial ACM certificates are issued:

1.  **Monitor SNS Alerts:** Pay attention to alerts from the `CertificateAlertTopic` indicating that certificates are approaching expiration (around 45 days before).
2.  **Monitor ACM Status:** Check the status of the ACM certificates in the AWS Management Console. ACM should automatically attempt renewal.
3.  **Automated Validation and Deployment:** The `VerifyDnsPropagationRule` and `AcmValidationSuccessRule` should automatically handle the DNS validation in Route 53 and trigger the `DeployCertificateLambda` to update the certificates on the EC2 instances once renewed by ACM.
4.  **Monitor Health Checks:** The daily `CertificateHealthCheckRule` will continue to verify that the correct and valid certificates are being served.
5.  **Manual Fallback:** If any issues arise, use the updated `dev-ops/ansible/install-new-certs.yml` playbook (providing the new certificate ARNs) or the `dev-ops/ansible/rollback-certs.yml` playbook as needed.

This automated process significantly reduces the manual effort required for annual certificate rollovers, primarily requiring monitoring and intervention only if issues occur.