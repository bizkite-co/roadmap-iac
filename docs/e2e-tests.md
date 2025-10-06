# E2E Test Infrastructure

This document describes the setup and usage of the End-to-End (E2E) test infrastructure defined in this `roadmap-iac` repository. These tests are designed to run on a scheduled basis against the deployed `roadmap-website` application.

## Overview

The E2E tests are written using Playwright (TypeScript) and reside in the `roadmap-website` repository. This `roadmap-iac` repository deploys an AWS Lambda function that orchestrates the execution of these tests on a schedule. Test reports (including HTML reports and screenshots) are uploaded to a dedicated S3 bucket, and an index of all test runs is maintained.

## Prerequisites

Before deploying or updating the E2E test infrastructure, ensure you have the following installed and configured:

*   **AWS CLI**: Configured with credentials that have permissions to deploy CDK stacks, manage Secrets Manager, and interact with S3 and SNS.
*   **1Password CLI (`op`)**: Installed and signed in to your 1Password account, with access to the `Roadmappartners` vault.
*   **`jq`**: A lightweight and flexible command-line JSON processor.
*   **Node.js & npm**: Required for CDK and managing Node.js dependencies.
*   **AWS CDK CLI**: Installed globally (`npm install -g aws-cdk`).

## Configuration

The E2E test infrastructure is configured via the `cdk.json` file in the root of this repository. You will need to set the following context variables:

*   `gitRepoUrl`: The HTTPS URL of your `roadmap-website` GitHub repository (e.g., `https://github.com/bizkite-co/roadmap-website`).
*   `secretName`: The name of the AWS Secrets Manager secret that will store the Playwright user's password (e.g., `roadmap-e2e-credentials`).
*   `snsTopicArn`: The ARN of an AWS SNS topic where failure notifications will be sent (e.g., `arn:aws:sns:us-west-1:318364255844:site-down`).
*   `scheduleExpression`: A cron expression defining when the E2E tests should run (e.g., `cron(0 12 * * ? *)` for daily at 12:00 UTC).
*   `reportsBucketPrefix`: A unique prefix for the S3 bucket that will store test reports and artifacts (e.g., `roadmap-website-e2e`). The full bucket name will be constructed as `${reportsBucketPrefix}-${AWS_ACCOUNT_ID}-${AWS_REGION}`.

Example `cdk.json` context:

```json
{
  "app": "npx ts-node bin/e2e-test-app.ts",
  "context": {
    "snsTopicArn": "arn:aws:sns:us-west-1:318364255844:site-down",
    "gitRepoUrl": "https://github.com/bizkite-co/roadmap-website",
    "secretName": "roadmap-e2e-credentials",
    "scheduleExpression": "cron(0 12 * * ? *)",
    "reportsBucketPrefix": "roadmap-website-e2e",
    "dummy": "true"
  }
}
```

## Deployment

Follow these steps to deploy the E2E test infrastructure:

1.  **Install Node.js dependencies:**
    ```bash
    npm install
    ```

2.  **Update AWS Secrets Manager with E2E credentials:**
    This step fetches the E2E user password from 1Password and stores it in AWS Secrets Manager. Ensure your `op` CLI is signed in.
    ```bash
    make update-e2e-secret
    ```

3.  **Deploy the CDK stack:**
    ```bash
    make deploy
    ```
    This will deploy the Lambda function, S3 reports bucket, and EventBridge schedule to your AWS account.

## Accessing Test Reports

After deployment and subsequent test runs, the Playwright HTML reports and all test artifacts (including screenshots) will be uploaded to the S3 reports bucket. An index of all test runs (`reports-index.json`) is maintained at the root of this bucket.

The URL for the static website hosting of the reports bucket will be outputted during `cdk deploy` (e.g., `http://roadmap-website-e2e-123456789012-us-west-1.s3-website-us-west-1.amazonaws.com`).

**Important:** The S3 bucket is configured with `BlockPublicAccess.BLOCK_ALL`, meaning it is **not publicly accessible**. To view the reports, you will need to implement a mechanism to generate **presigned URLs** for the `index.html` of the desired report. This can be done via an authenticated Lambda function or directly from your application for admin-logged-in users.

### Future Enhancement: Reports Index Viewer

Currently, accessing the `reports-index.json` directly would require AWS credentials. A future enhancement could involve deploying a simple static HTML page (or another Lambda-backed API) to the same S3 bucket that reads `reports-index.json` and presents a user-friendly list of reports, with links that generate presigned URLs on demand.
