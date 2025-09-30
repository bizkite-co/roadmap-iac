# Plan for Scheduled E2E Tests

### **Overall Goal**
To implement daily scheduled E2E tests for the `roadmap-website` app, running on the live site, capturing screenshots, and uploading them to an S3 bucket, with secure credential management using 1Password and AWS Secrets Manager.

### **Current Understanding**
*   **E2E Tests:** Playwright tests (`e2e/login.test.ts`, `e2e/forgot-password.test.ts`) written in TypeScript, using `@aws-sdk/client-s3` for screenshot uploads. They rely on `stack.config.json` for URLs and `ROADMAP_USERNAME`, `ROADMAP_PASSWORD` environment variables for login.
*   **Configuration:** `stack.config.json` provides environment-specific URLs and cron schedules for E2E tests.
*   **CDK:** An existing CDK application (`bin/auto-start-stop-ec2.ts`) manages EC2 instances, but a new CDK stack will be needed for E2E test scheduling. The `package.json` indicates a Node/TypeScript environment for CDK.
*   **Credentials:** 1Password will be used for `ROADMAP_USERNAME` and `ROADMAP_PASSWORD` (provided as `"op://Private/Roadmappartners/username"` and `"op://Private/Roadmappartners/password"`). AWS credentials for CDK deployment are assumed to be configured locally.

### **Detailed Plan**

#### **Phase 1: Local Test Execution**

The first step is to ensure the E2E tests can be run manually and locally.

1.  **Install Dependencies:**
    *   Run `npm install` in the workspace root to install Node.js and Playwright dependencies from `package.json`.
    *   Run `npx playwright install` to download and install the necessary browser binaries for Playwright.

2.  **Set Environment Variables:**
    *   Before running tests, the `ROADMAP_USERNAME` and `ROADMAP_PASSWORD` environment variables must be set using the 1Password CLI.
    *   Example command:
        ```bash
        op run --env ROADMAP_USERNAME="op://Private/Roadmappartners/username" --env ROADMAP_PASSWORD="op://Private/Roadmappartners/password" -- npx playwright test e2e/login.test.ts
        ```

3.  **Run Tests:**
    *   Execute the Playwright tests using the command above. This will run `e2e/login.test.ts`, navigate the website, perform actions, and attempt to upload screenshots to the configured S3 bucket.

#### **Phase 2: CDK Deployment for Scheduled Tests**

This phase involves creating and deploying AWS infrastructure using CDK to automate the E2E tests.

1.  **Choose a Runtime Environment:**
    *   **AWS CodeBuild** will be used to run the Playwright tests. It provides a containerized environment suitable for browser automation and can be easily triggered by CloudWatch Events.

2.  **Create a New CDK Stack:**
    *   A new TypeScript CDK stack, `lib/e2e-test-scheduler-stack.ts`, will be created. This stack will define all the necessary AWS resources.

3.  **Define AWS Resources:**

    *   **AWS Secrets Manager:**
        *   Two secrets will be created in AWS Secrets Manager: one for `ROADMAP_USERNAME` and one for `ROADMAP_PASSWORD`.
        *   During the *CDK deployment*, the actual values will be fetched from 1Password using `op run` and then stored securely in Secrets Manager.
        *   The CodeBuild project's IAM role will be granted permissions to read these secrets.

    *   **AWS CodeBuild Project:**
        *   A CodeBuild project will be configured with:
            *   A Docker image that includes Node.js, npm, and Playwright (e.g., a custom image or a suitable public image).
            *   A `buildspec.yml` file that will:
                *   Install Node.js dependencies.
                *   Install Playwright browsers.
                *   Retrieve `ROADMAP_USERNAME` and `ROADMAP_PASSWORD` from AWS Secrets Manager and set them as environment variables for the test run.
                *   Execute the Playwright tests (`npx playwright test`).
        *   The CodeBuild service role will be granted `s3:PutObject` permissions to the `higginbotham-prs-logs` bucket for the `test-snapshots` prefix.

    *   **AWS CloudWatch Event Rule:**
        *   A CloudWatch Event Rule will be created to trigger the CodeBuild project.
        *   The schedule will be configured using cron expressions from `stack.config.json` (e.g., `cron(0 13 ? * MON-FRI *)`).

4.  **Update CDK Application Entry Point:**
    *   The `cdk.json` file will be updated to include the new `e2e-test-scheduler-stack.ts` as an application entry point, or it will be integrated into the existing `bin/auto-start-stop-ec2.ts` if appropriate (a separate entry point is preferred for clarity).

5.  **Deployment:**
    *   The new CDK stack will be deployed using `npx cdk deploy`. This command will need to be run with `op run` to inject the 1Password credentials for creating the Secrets Manager entries during deployment.

#### **Phase 3: Documentation Strategy**

Comprehensive documentation will be created to guide future development and maintenance.

1.  **Documentation Location:** A new Markdown file, `docs/e2e-testing-strategy.md`, will be created.

2.  **Content:** The documentation will cover:
    *   **Overview:** Purpose and scope of E2E testing.
    *   **Local Execution:** Step-by-step guide for running tests manually, including dependency setup and 1Password integration.
    *   **CDK Deployment:** Detailed explanation of the `e2e-test-scheduler-stack.ts`, CodeBuild configuration, CloudWatch Events, Secrets Manager usage, and IAM roles.
    *   **Configuration:** How to modify `stack.config.json` for test schedules and URLs.
    *   **Troubleshooting:** Common issues and their resolutions.
    *   **1Password Integration:** Clear instructions on how 1Password is used for both local execution and CDK deployment.

### **Architectural Diagram**

```mermaid
graph TD
    A[Playwright E2E Tests] --> B(e2e/login.test.ts)
    B --> C{stack.config.json}
    C --> D[Base URL, Login Path, S3 Bucket]
    B --> E[Environment Variables: ROADMAP_USERNAME, ROADMAP_PASSWORD]

    subgraph Local Execution
        F[User's Local Machine] --> G(npm install)
        F --> H(npx playwright install)
        F --> I(op run --env ... npx playwright test)
        I --> B
    end

    subgraph AWS CDK Deployment
        J[CDK Application] --> K(lib/e2e-test-scheduler-stack.ts)
        K --> L[AWS CodeBuild Project]
        L --> M[Buildspec.yml]
        M --> N[Install Dependencies]
        M --> O[Fetch Secrets from AWS Secrets Manager]
        M --> P[Run Playwright Tests]
        P --> Q[Upload Screenshots to S3]
        L --> R[IAM Role for CodeBuild]
        R --> S[S3 PutObject Permission]
        R --> T[Secrets Manager Read Permission]

        K --> U[AWS CloudWatch Event Rule]
        U --> V[Cron Schedule from stack.config.json]
        U --> L

        K --> W[AWS Secrets Manager]
        W --> X[ROADMAP_USERNAME Secret]
        W --> Y[ROADMAP_PASSWORD Secret]
        F --> Z[op run --env ... npx cdk deploy]
        Z --> K
    end

    D --> Q
    O --> E