## Task: Automate Annual Certificate Rollover

**Description:**

Automate the annual certificate renewal process for domains registered with GoDaddy and hosted on EC2 instances by migrating domain management to AWS Route 53 and leveraging AWS ACM and EventBridge for a streamlined, less error-prone workflow.

**Current Situation:**

*   Annual certificate rollover is currently a manual process using Ansible playbooks (`dev-ops/ansible/install-new-certs.yml`, `dev-ops/ansible/rollback-certs.yml`).
*   Certificates are obtained from GoDaddy.
*   Infrastructure is managed using AWS CDK (`lib/auto-start-stop-ec2-stack.ts`), including EC2 instance start/stop schedules and E2E tests via EventBridge.
*   Certificates were recently updated manually.
*   Approval has been granted to transfer the domains from GoDaddy to AWS Route 53.
*   Public SSL/TLS certificates provisioned through AWS Certificate Manager (ACM) are free.
*   We have the auth code for `retirementtaxanalyzer.com` but are still waiting for the auth code for `roadmappartners.net`.
*   The previous attempt to deploy the CDK stack encountered deployment problems and NPM vulnerabilities.

**Objective:**

Implement an automated certificate renewal process that:
*   Transfers domain registration from GoDaddy to AWS Route 53.
*   Uses AWS ACM for certificate issuance and managed renewal.
*   Utilizes EventBridge for scheduling renewal checks and triggering actions.
*   Provides automated alerts for certificate expiration via SNS.
*   Integrates with the existing CDK stack (where feasible, otherwise use AWS CLI or scripts).
*   Includes certificate health checks.

**Proposed Solution: AWS ACM with EventBridge and Route 53**

Leverage AWS Certificate Manager (ACM) for managed certificate lifecycle, Amazon EventBridge for event-driven automation and scheduling, and AWS Route 53 for DNS management.

**Plan:**

1.  **Domain Transfer to Route 53 (Partial):**
    *   Initiate the domain transfer process from GoDaddy to AWS Route 53 for `retirementtaxanalyzer.com` (since we have the auth code).
    *   This involves configuring the transfer in Route 53 using the AWS CLI.
    *   Monitor the transfer process until it is complete.
    *   Wait for the auth code for `roadmappartners.net` before initiating the transfer for that domain.

Note: When working with Route 53, the `AWS_REGION` environment variable must be set to `us-east-1`, as Route 53 is a global service and `us-east-1` is the region for all AWS global services.
2.  **Request ACM Certificates (Using AWS CLI):**
    *   Once `retirementtaxanalyzer.com` is in Route 53, request a new public ACM certificate for the domain using the AWS CLI. Choose DNS validation. ACM will automatically create and manage the validation CNAME records within Route 53. Note that for certificates intended for global services like CloudFront (if applicable in the future), the certificate must be requested in the `us-east-1` region.
    *   Similarly, once `roadmappartners.net` is transferred, request an ACM certificate for `*.roadmappartners.net`.
3.  **Update Certificate Deployment (Using Ansible):**
    *   Modify the existing `dev-ops/ansible/install-new-certs.yml` playbook to fetch the validated certificates from ACM using the AWS CLI and deploy them to the EC2 instances.
4.  **Configure EventBridge Rules (Using AWS CLI):**
    *   Set up EventBridge rules to monitor ACM certificate expiration events (e.g., `ACM Certificate Approaching Expiration`) using the AWS CLI.
    *   Configure targets for these rules, such as an SNS topic, to send alerts to administrators when certificates are nearing expiration (e.g., 45 days before expiration).
5.  **Integrate with CDK Stack (Limited):**
    *   Focus on using the CDK stack for components that are working correctly and avoid deploying changes that are causing issues.
    *   Consider creating a separate, smaller CDK stack specifically for managing the ACM certificates and EventBridge rules if the existing stack is too complex.
6.  **Implement Certificate Health Checks:**
    *   Add automated checks (e.g., using a Lambda function triggered by EventBridge or CloudWatch Alarms, or integrating with existing E2E tests) to verify that the correct and valid certificates are being served by the web server on the EC2 instances. These checks should ideally run periodically and alert on failure.
7.  **Test and Deploy:**
    *   Thoroughly test the end-to-end automated process in a staging environment before deploying to production. This includes testing certificate issuance, DNS validation, deployment, renewal, and alerting.

**Workflow Visualization:**

```mermaid
graph LR
    A[Initiate Domain Transfer to Route 53 (retirementtaxanalyzer.com)] --> B{ACM Requests Certificate (DNS Validation)}
    B --> C{ACM Automatically Creates CNAME in Route 53}
    C --> D{ACM Validates Domain & Issues Certificate}
    D --> E{ACM Manages Renewal}
    E -- Certificate Approaching Expiration --> F(EventBridge Rule Triggered)
    F --> G(Send SNS Notification)
    E -- Successful Renewal --> H[Deploy Certificate to EC2 (via Ansible)]
    H --> I[Implement Certificate Health Checks]
```

**Implementation Status**

The automated certificate rollover process using AWS ACM and EventBridge has been partially implemented. The following components have been added or updated:

*   **CDK Stack (`lib/auto-start-stop-ec2-stack.ts`):**
    *   Defined ACM certificates for `*.roadmappartners.net` and `retirementtaxanalyzer.com` with DNS validation via Route 53.
    *   Added Route 53 Hosted Zones for the domains (assuming DNS migration).
    *   Created an SNS topic (`CertificateAlertTopic`) for alerts.
    *   Configured an EventBridge rule (`AcmCertificateExpirationRule`) for ACM expiration warnings and expiry.
    *   Added a Lambda function (`VerifyDnsPropagationLambda`) to verify ACM validation status.
    *   Configured an EventBridge rule (`VerifyDnsPropagationRule`) to periodically trigger the validation verification Lambda.
    *   Added a Lambda function (`DeployCertificateLambda`) to trigger the Ansible deployment playbook via Systems Manager Run Command.
    *   Configured an EventBridge rule (`AcmValidationSuccessRule`) to trigger the deployment Lambda upon successful ACM validation (via a custom event).
    *   Added a Lambda function (`CheckCertificateHealthLambda`) for periodic certificate health checks.
    *   Configured an EventBridge rule (`CertificateHealthCheckRule`) to trigger the health check Lambda daily.
*   **Ansible Playbook (`dev-ops/ansible/install-new-certs.yml`):**
    *   Modified to fetch certificate body and chain from ACM using the AWS CLI.
*   **Lambda Function (`lambda/verify-dns-propagation.py`):**
    *   Implemented logic to check ACM validation status and emit a custom EventBridge event upon success.
*   **Lambda Function (`lambda/check-certificate-health.py`):**
    *   Implemented logic to check the expiry date of live certificates and send SNS alerts.
*   **User Guide (`dev-ops/certs/ACM_USER_GUID.md`):**
    *   Created a guide explaining the implemented automation, remaining manual steps (DNS migration, initial ACM request/validation), and the annual process timeline.

**Achievements**

*   Read the contents of `task.md` to understand the requirements.
*   Created a Python script (`get_auth_codes.py`) to retrieve authorization codes from the GoDaddy API.
*   Added code to the `get_auth_codes.py` script to include the `delegate` parameter in the API call.
*   Modified the `get_auth_codes.py` script to check if the domains are locked and unlock them if they are.
*   Updated the `lib/auto-start-stop-ec2-stack.ts` file to re-add the `CertificateAutomationConstruct` to the stack.
*   Added the ACM certificate ARN outputs back to the `lib/auto-start-stop-ec2-stack.ts` file.
*   Installed the `@types/node` module to fix TypeScript errors.
*   Initiated the domain transfer process for `retirementtaxanalyzer.com` and created a script to monitor the transfer status.
*   Connected the domain `retirementtaxanalyzer.com` to the PROD EC2 instance by creating an A record in Route 53.
*   Verified that the domain `retirementtaxanalyzer.com` is pointing to the PROD EC2 instance by executing the `curl retirementtaxanalyzer.com` command and confirming that the output was a 302 redirect to `https://retirementtaxanalyzer.com/`.

**Current Problems**

*   We are still having trouble with the import statements in `lib/auto-start-stop-ec2-stack.ts`.
*   We need to migrate the DNS records from GoDaddy to Route 53.
*   We need to get the authorization code for `roadmappartners.net`.
*   The previous attempt to deploy the CDK stack encountered deployment problems and NPM vulnerabilities.

**Next Steps:**

1.  Request an ACM certificate for `retirementtaxanalyzer.com` using the AWS CLI.
2.  Modify the `dev-ops/ansible/install-new-certs.yml` playbook to fetch the validated certificate from ACM using the AWS CLI and deploy it to the EC2 instances.
3.  Set up EventBridge rules to monitor ACM certificate expiration events using the AWS CLI.
4.  Configure subscriptions for the `CertificateAlertTopic` SNS topic.
5.  Ensure AWS Systems Manager Agent is running on the target EC2 instances and they have the necessary IAM role to be managed by SSM.
6.  Update the `ansible_playbook_path` and `ansible_inventory_path` variables in the `DeployCertificateLambda` code within the CDK stack to the correct paths on the EC2 instance.
7.  Thoroughly test the end-to-end automated process in a staging environment before deploying to production. This includes testing certificate issuance, DNS validation, deployment, renewal, and alerting.
8.  Wait for the authorization code for `roadmappartners.net` and then transfer that domain as well.
9.  Re-evaluate the CDK stack deployment issues and address them separately.

## Subtask: Fix CDK Build Errors

**Description:**

Address the TypeScript compilation errors encountered during the CDK build process to enable successful deployment of the automated certificate rollover infrastructure.

**Current Situation:**

Attempting to build the CDK stack resulted in TypeScript compilation errors related to the `@types/babel__traverse` package.

**Objective:**

Resolve the TypeScript compilation errors to allow the CDK build to complete successfully.

**Steps:**

1.  Analyze the specific TypeScript errors (`TS1005: '?' expected.`) in the context of the project's dependencies and `tsconfig.json`.
2.  Identify the root cause of the compatibility issue between `@types/babel__traverse` and the current TypeScript version or other dependencies.
3.  Implement the necessary fix, which may involve:
    *   Updating or downgrading `@types/babel__traverse`.
    *   Adjusting TypeScript compiler options in `tsconfig.json`.
4.  Verify that the CDK build (`npm run build`) completes without errors.

**Next Steps:**

Once the build errors are resolved, proceed with deploying the updated CDK stack as outlined in the main task plan.
