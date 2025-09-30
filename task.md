# E2E Test Refactoring Plan

**Goal:** Refactor the Playwright E2E tests to use a TOML configuration file for credentials and settings, and to save screenshots to a structured S3 path.

**Context:**
*   This plan is to be executed from within the `/home/mstouffer/repos/prs/roadmap-iac` directory.
*   The E2E tests are in the `e2e/` directory.
*   Tests are failing due to credential and configuration issues.
*   The user runs tests locally via 1Password CLI: `op run -- npm exec playwright test e2e/`

---

### 1. Implement TOML Configuration

**a. Create `config.example.toml`:**
   - Create a file named `config.example.toml` in the project root to serve as a template.
   - Content:
     ```toml
     # Configuration for E2E Tests

     [user]
     email = "user@example.com"
     password = "your-password"

     [s3]
     bucketName = "higginbotham-prs-logs"
     region = "us-west-1"

     [settings]
     # Environment can be 'dev', 'uat', or 'prod'
     env = "dev"
     ```

**b. Create `e2e/config.ts`:**
   - Create a file to define the TypeScript interface for the configuration.
   - Content:
     ```typescript
     export interface TestConfig {
       user: {
         email: string;
         password: string;
       };
       s3: {
         bucketName: string;
         region: string;
       };
       settings: {
         env: string;
       };
     }
     ```

**c. Create `e2e/config.loader.ts`:**
   - Create a loader to parse `config.toml` and provide a typed configuration object.
   - It should read `config.toml` and use a TOML parser (like `@iarna/toml`).
   - It should also allow environment variables to override TOML values for CI/CD.

**d. Update `.gitignore`:**
   - Add `config.toml` to the `.gitignore` file to avoid committing credentials.

### 2. Implement Dynamic S3 Path

**a. Create `e2e/global-setup.ts`:**
   - This script will run once before all tests.
   - It will use the config loader to get the environment (`dev`, `uat`, etc.).
   - It will generate a timestamp string (`YYYY-MM-DD/HH-MM-SS`).
   - It will construct the S3 path: `test-snapshots/[env]/[timestamp]`.
   - It will write this path to a temporary file, `e2e/s3path.txt`, for tests to read.

**b. Update `playwright.config.ts`:**
   - Register `e2e/global-setup.ts` in the `globalSetup` property of the Playwright config.

**c. Update `.gitignore`:**
   - Add `e2e/s3path.txt` to the `.gitignore` file.

### 3. Refactor E2E Tests

**a. Update all `*.test.ts` files:**
   - Remove the old hardcoded configuration (`test-config.ts`).
   - In each test that uploads a screenshot, read the base S3 path from `e2e/s3path.txt`.
   - Construct the final screenshot key: `[base_s3_path]/[test_name]-[timestamp].png`.
   - For credentials, import the config loader and use the `user.email` and `user.password` values when interacting with login forms.

**Example change in a test file:**
```typescript
// Before
const testUserEmail = 'mark@getbizkite.com';
await page.locator('#email').fill(testUserEmail);

// After
import { config } from './config.loader'; // Assuming loader exports a singleton
await page.locator('#email').fill(config.user.email);
```