# E2E Test Infrastructure

This document describes the scheduled Playwright run defined in this `roadmap-iac` repository. The tests live in `roadmap-website`. The runner checks those files out and opens the live site. It does not deploy the application.

## Overview

CodeBuild project `roadmap-prod-e2e-test-runner` in `us-west-1` runs the Chromium Playwright suite. As of 16 November 2026 its source is GitHub `https://github.com/bizkite-co/roadmap-website.git`, branch `uat`. `BASE_URL` is `https://roadmappartners.net`, `TARGET_ENV` is `prod`, and `E2E_DB_INSTANCE_TAG` is `PRS-PROD`. EventBridge starts it on weekdays at 13:00 and 20:00 UTC. A failed build publishes to `roadmap-prod-e2e-test-runner-notifications`.

The checkout is the test program. The browser then uses the production site. A push to GitHub does not deploy the WAR. Deploy remains `scripts/deploy.sh` over SSH.

On 15 November 2026 at 10:09 PM Pacific, build `roadmap-prod-e2e-test-runner:faf75e36-0573-42d0-a42b-560c231a44e7` resolved commit `49cecb3` and succeeded: 13 passed, 1 flaky.

The CDK in this repo now sets `gitOwner` to `bizkite-co`, `gitBranch` to `uat`, and `Source.gitHub` with the webhook off. That stack has not been deployed. Deploying the previously deployed template would point the project back at CodeCommit `dev`. Do not deploy that old template.

CodeBuild reads the private repository with an account-level GitHub personal access token. The token value is not stored in this repo.

## Prerequisites

Before deploying or updating the E2E test infrastructure, ensure you have the following installed and configured:

*   **AWS CLI**: Configured with credentials that have permissions to deploy CDK stacks, manage Secrets Manager, and interact with S3 and SNS.
*   **1Password CLI (`op`)**: Installed and signed in to your 1Password account, with access to the `Roadmappartners` vault.
*   **`jq`**: A lightweight and flexible command-line JSON processor.
*   **Node.js & npm**: Required for CDK and managing Node.js dependencies.
*   **AWS CDK CLI**: Installed globally (`npm install -g aws-cdk`).

## Configuration

`cdk.json` selects the GitHub checkout:

*   `gitOwner`: `bizkite-co`
*   `gitRepo`: `roadmap-website`
*   `gitBranch`: `uat`
*   `e2eTargetEnv`: `prod`. The stack strips a trailing `/roadmap` from the configured base URL, because the specs request `/roadmap/...` themselves.

`stack.config.json` holds the weekday cron expressions under `prod.e2eTestSchedule`: `cron(0 13 ? * MON-FRI *)` and `cron(0 20 ? * MON-FRI *)`.

Each run creates `test@bizkite.net` on the production database, uses that login for the signed-in specs, and deletes it at the end. The password is generated in the build and is not stored in Secrets Manager. The registration spec also creates a real trial account and does not delete it.

## Deployment

The live project was pointed at GitHub with the CodeBuild API. `RoadmapE2ETestStack` has not been redeployed since that change. A later `cdk deploy` must use this updated source. Deploying the old template puts the job back on CodeCommit `dev`.

Reports go to `roadmap-prod-e2e-test-runner-reports-865664998993-us-west-1`.

## Accessing Test Reports

After deployment and subsequent test runs, the Playwright HTML reports and all test artifacts (including screenshots) will be uploaded to the S3 reports bucket. An index of all test runs (`reports-index.json`) is maintained at the root of this bucket.

The URL for the static website hosting of the reports bucket will be outputted during `cdk deploy` (e.g., `http://roadmap-website-e2e-123456789012-us-west-1.s3-website-us-west-1.amazonaws.com`).

**Important:** The S3 bucket is configured with `BlockPublicAccess.BLOCK_ALL`, meaning it is **not publicly accessible**. To view the reports, you will need to implement a mechanism to generate **presigned URLs** for the `index.html` of the desired report. This can be done via an authenticated Lambda function or directly from your application for admin-logged-in users.

### Future Enhancement: Reports Index Viewer

Currently, accessing the `reports-index.json` directly would require AWS credentials. A future enhancement could involve deploying a simple static HTML page (or another Lambda-backed API) to the same S3 bucket that reads `reports-index.json` and presents a user-friendly list of reports, with links that generate presigned URLs on demand.
