# Task: Implement Local E2E Test Execution

## Description
Implement the first phase of the E2E testing setup: enabling local and manual execution of the Playwright tests. This involves installing dependencies, securely setting environment variables using 1Password, and running the tests.

## Context for Implementation

*   **E2E Test File:** `e2e/login.test.ts`
*   **Configuration File:** `stack.config.json` (contains `baseUrl`, `loginPath`, etc.)
*   **Dependencies:** Managed via `package.json` (Node.js, Playwright).
*   **Credentials:**
    *   `ROADMAP_USERNAME`: `"op://Private/Roadmappartners/username"`
    *   `ROADMAP_PASSWORD`: `"op://Private/Roadmappartners/password"`
    *   These credentials are required by `e2e/login.test.ts` for logging into the website.
*   **Screenshot Uploads:** The `e2e/login.test.ts` script is already configured to upload screenshots to an S3 bucket (`higginbotham-prs-logs/test-snapshots`). Ensure the local environment has AWS credentials configured for this (e.g., via `aws configure` or environment variables).

## Implementation Steps

1.  **Install Node.js Dependencies:**
    *   Execute `npm install` in the workspace root directory to install all packages listed in `package.json`.

2.  **Install Playwright Browsers:**
    *   Execute `npx playwright install` to download and install the necessary browser binaries for Playwright.

3.  **Run Playwright Tests with 1Password Integration:**
    *   Use the 1Password CLI to inject the `ROADMAP_USERNAME` and `ROADMAP_PASSWORD` environment variables and then run the Playwright tests.
    *   The command should look like this:
        ```bash
        op run --env ROADMAP_USERNAME="op://Private/Roadmappartners/username" --env ROADMAP_PASSWORD="op://Private/Roadmappartners/password" -- npx playwright test e2e/login.test.ts
        ```
    *   Verify that the tests run successfully, navigate the website, and attempt to upload screenshots to S3.

## Expected Outcome
Successful execution of `e2e/login.test.ts` locally, with screenshots uploaded to the designated S3 bucket.
