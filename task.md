## Task: Automate Annual Certificate Rollover

**Description:**

Automate the annual certificate renewal process for domains registered with GoDaddy and hosted on EC2 instances, leveraging AWS ACM and EventBridge for a streamlined, less error-prone workflow.

**Current Situation:**

*   Annual certificate rollover is currently a manual process using Ansible playbooks (`dev-ops/ansible/install-new-certs.yml`, `dev-ops/ansible/rollback-certs.yml`).
*   Certificates are obtained from GoDaddy.
*   Infrastructure is managed using AWS CDK (`lib/auto-start-stop-ec2-stack.ts`), including EC2 instance start/stop schedules and E2E tests via EventBridge.
*   Certificates were recently updated manually, so this automation is being set up for next year's renewal.

**Objective:**

Implement an automated certificate renewal process that:
*   Uses AWS ACM for certificate issuance and managed renewal.
*   Automates DNS validation for GoDaddy-registered domains.
*   Utilizes EventBridge for scheduling renewal checks and triggering actions.
*   Provides automated alerts for certificate expiration via SNS.
*   Integrates with the existing CDK stack.
*   Includes certificate health checks.

**Proposed Solution: AWS ACM with EventBridge**

Leverage AWS Certificate Manager (ACM) for managed certificate lifecycle and Amazon EventBridge for event-driven automation and scheduling.

**Plan:**

1.  **Request ACM Certificates:** Request public ACM certificates for the required domains (e.g., `retirementtaxanalyzer.com`, `*.roadmappartners.net`). Choose DNS validation. Note that for certificates intended for global services like CloudFront (if applicable in the future), the certificate must be requested in the `us-east-1` region.
2.  **Automate DNS Validation:**
    *   ACM will provide CNAME records for validation.
    *   **Option A (Using GoDaddy API):** Develop automation (e.g., a script or Lambda function) to use the GoDaddy API to add/update the required CNAME records in the GoDaddy DNS zone. This requires GoDaddy API access (verified via API key, which has been added to `.envrc`).
    *   **Option B (Migrate DNS to Route 53):** Migrate DNS hosting for the domains from GoDaddy to AWS Route 53. ACM can then automatically create and manage the validation CNAME records within Route 53. This is generally the preferred and simpler approach for ACM DNS validation within AWS. This would involve updating the domain's nameservers at GoDaddy to point to the Route 53 hosted zone nameservers.
3.  **Verify DNS Propagation:** Implement a mechanism (e.g., using a script or AWS Lambda) to verify that the CNAME records have propagated before ACM can validate the domain.
4.  **Update Certificate Deployment:** Modify the existing certificate deployment process. This could involve:
    *   Updating the `dev-ops/ansible/install-new-certs.yml` playbook to fetch the validated certificates from ACM using the AWS CLI or SDK and deploy them to the EC2 instances.
    *   Alternatively, create a new deployment mechanism (e.g., a Lambda function triggered by EventBridge) that fetches the certificates from ACM and updates the web server configuration on the EC2 instances.
5.  **Configure EventBridge Rules:**
    *   Set up EventBridge rules to monitor ACM certificate expiration events (e.g., `ACM Certificate Approaching Expiration`).
    *   Configure targets for these rules, such as an SNS topic, to send alerts to administrators when certificates are nearing expiration (e.g., 45 days before expiration).
    *   Consider a scheduled EventBridge rule to trigger the certificate deployment mechanism (from step 4) after successful ACM renewal.
6.  **Integrate with CDK Stack:** Update `lib/auto-start-stop-ec2-stack.ts` to define and deploy the ACM certificates, EventBridge rules, and SNS topic as part of the infrastructure. This will ensure the automation is managed as infrastructure as code.
7.  **Implement Certificate Health Checks:** Add automated checks (e.g., using a Lambda function triggered by EventBridge or CloudWatch Alarms, or integrating with existing E2E tests) to verify that the correct and valid certificates are being served by the web server on the EC2 instances. These checks should ideally run periodically and alert on failure.
8.  **Test and Deploy:** Thoroughly test the end-to-end automated process in a staging environment before deploying to production. This includes testing certificate issuance, DNS validation, deployment, renewal, and alerting.

**Workflow Visualization:**

```mermaid
graph LR
    A[Request ACM Certificate (DNS Validation)] --> B{Add CNAME Record to GoDaddy DNS}
    B --> C[Verify DNS Propagation]
    C --> D{ACM Validates Domain & Issues Certificate}
    D --> E{ACM Manages Renewal}
    E -- Certificate Approaching Expiration --> F(EventBridge Rule Triggered)
    F --> G(Send SNS Notification)
    E -- Successful Renewal --> H(Scheduled Deployment Trigger)
    H --> I[Deploy Certificate to EC2 (via Ansible/other)]
    I --> J[Implement Certificate Health Checks]
```

*(Alternative for Step 2: Migrate DNS to Route 53)*
```mermaid
graph LR
    A[Request ACM Certificate (DNS Validation)] --> B{Migrate DNS to Route 53}
    B --> C{ACM Automatically Creates CNAME in Route 53}
    C --> D{ACM Validates Domain & Issues Certificate}
    D --> E{ACM Manages Renewal}
    E -- Certificate Approaching Expiration --> F(EventBridge Rule Triggered)
    F --> G(Send SNS Notification)
    E -- Successful Renewal --> H(Scheduled Deployment Trigger)
    H --> I[Deploy Certificate to EC2 (via Ansible/other)]
    I --> J[Implement Certificate Health Checks]
```

**Next Steps:**

Implement the plan outlined above.

## Implementation Status

The automated certificate rollover process using AWS ACM and EventBridge has been partially implemented. The following components have been added or updated:

-   **CDK Stack (`lib/auto-start-stop-ec2-stack.ts`):**
    -   Defined ACM certificates for `*.roadmappartners.net` and `retirementtaxanalyzer.com` with DNS validation via Route 53.
    -   Added Route 53 Hosted Zones for the domains (assuming DNS migration).
    -   Created an SNS topic (`CertificateAlertTopic`) for alerts.
    -   Configured an EventBridge rule (`AcmCertificateExpirationRule`) for ACM expiration warnings and expiry.
    -   Added a Lambda function (`VerifyDnsPropagationLambda`) to verify ACM validation status.
    -   Configured an EventBridge rule (`VerifyDnsPropagationRule`) to periodically trigger the validation verification Lambda.
    -   Added a Lambda function (`DeployCertificateLambda`) to trigger the Ansible deployment playbook via Systems Manager Run Command.
    -   Configured an EventBridge rule (`AcmValidationSuccessRule`) to trigger the deployment Lambda upon successful ACM validation (via a custom event).
    -   Added a Lambda function (`CheckCertificateHealthLambda`) for periodic certificate health checks.
    -   Configured an EventBridge rule (`CertificateHealthCheckRule`) to trigger the health check Lambda daily.
-   **Ansible Playbook (`dev-ops/ansible/install-new-certs.yml`):**
    -   Modified to fetch certificate body and chain from ACM using the AWS CLI.
-   **Lambda Function (`lambda/verify-dns-propagation.py`):**
    -   Implemented logic to check ACM validation status and emit a custom EventBridge event upon success.
-   **Lambda Function (`lambda/check-certificate-health.py`):**
    -   Implemented logic to check the expiry date of live certificates and send SNS alerts.
-   **User Guide (`dev-ops/certs/ACM_USER_GUID.md`):**
    -   Created a guide explaining the implemented automation, remaining manual steps (DNS migration, initial ACM request/validation), and the annual process timeline.

**Next Steps:**

1.  Deploy the updated CDK stack to provision the new AWS resources.
2.  Perform the initial ACM certificate request and ensure DNS validation is successful (this should be largely automated if DNS is in Route 53).
3.  Verify the initial automated certificate deployment to the EC2 instances.
4.  Configure subscriptions for the `CertificateAlertTopic` SNS topic.
5.  Ensure AWS Systems Manager Agent is running on the target EC2 instances and they have the necessary IAM role to be managed by SSM.
6.  Update the `ansible_playbook_path` and `ansible_inventory_path` variables in the `DeployCertificateLambda` code within the CDK stack to the correct paths on the EC2 instance.
7.  Thoroughly test the end-to-end automated process in a staging environment before deploying to production.
