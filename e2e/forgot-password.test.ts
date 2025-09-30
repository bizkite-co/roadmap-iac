import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.loader';

const s3Client = new S3Client({ region: config.s3.region });

test.describe('Forgot Password E2E Test Suite', () => {
  let consoleLogs: string[] = [];
  let networkLogs: { url: string; status: number; method: string }[] = [];

  test.beforeEach(async ({ page }) => {
    consoleLogs = [];
    networkLogs = [];

    page.on('console', message => {
      consoleLogs.push(`[Console ${message.type()}] ${message.text()}`);
    });

    page.on('request', request => {
      networkLogs.push({ url: request.url(), method: request.method(), status: 0 }); // Status will be updated by response
    });

    page.on('response', async response => {
      const index = networkLogs.findIndex(log => log.url === response.url() && log.method === response.request().method());
      if (index !== -1) {
        networkLogs[index].status = response.status();
      } else {
        networkLogs.push({ url: response.url(), method: response.request().method(), status: response.status() });
      }
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`\n--- Test Failed: ${testInfo.title} ---`);
      console.error('Console Logs:');
      consoleLogs.forEach(log => console.error(log));
      console.error('\nNetwork Logs:');
      networkLogs.forEach(log => console.error(`[${log.method}] ${log.url} - ${log.status}`));
      console.error('-----------------------------------\n');
    }
  });

  test('Forgot Password Flow', async ({ page }) => {

    const forgotPasswordPath = '/roadmap/forgotPassword';

    // 1. Navigate to the "Forgot Password" form
    console.log(`Navigating to: ${forgotPasswordPath}`);
    try {
      const response = await page.goto(forgotPasswordPath, { waitUntil: 'networkidle' }); // Wait for network to be idle
      expect(response?.status()).toBe(200);
    } catch (error: any) {
      console.error(`Navigation to ${forgotPasswordPath} failed: ${error.message}`);
      throw new Error(`Failed to navigate to ${forgotPasswordPath}: ${error.message}`);
    }

    // Ensure the email input field is visible and ready before filling
    const emailInputLocator = page.locator('form#recover input[name="email"]');
    await emailInputLocator.waitFor({ state: 'visible' });

    // 2. Fill out the form with a test user's email
    await emailInputLocator.fill(config.user.email);

    // 3. Submit the form
    await page.locator('input[type="submit"][name="recover"]').click(); // Corrected locator for submit button

    console.log('--- Forgot Password Page Content After Submit ---');
    console.log(await page.content());

    // 4. Verify a success message or redirection (adjust as per actual application behavior)
    await expect(page.locator('body', { hasText: 'Recovery email sent!' })).toBeVisible();

    // 5. Verify that the user's password was reset and the Password_reset flag is set to 1 in the database.
    console.log(`TODO: Verify database for user ${config.user.email} to confirm password reset and Password_reset flag.`);

    // Take screenshot
    const screenshot = await page.screenshot();
    const s3PathFile = path.resolve(__dirname, 's3path.txt');
    const s3BasePath = fs.readFileSync(s3PathFile, 'utf-8');
    const filename = `forgot-password-test-${Date.now()}.png`;
    const filePath = `${s3BasePath}/${filename}`;

    // Upload screenshot to S3
    try {
      const uploadParams = {
        Bucket: config.s3.bucketName,
        Key: filePath,
        Body: screenshot,
        ContentType: 'image/png',
      };

      const command = new PutObjectCommand(uploadParams);
      await s3Client.send(command);

      console.log(`Screenshot uploaded to s3://${config.s3.bucketName}/${filePath}`);
    } catch (error) {
      console.error('Error uploading screenshot to S3:', error);
    }
  });
});
