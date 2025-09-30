import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.loader';

const s3Client = new S3Client({ region: config.s3.region });

test.describe('Forgot Username E2E Test Suite', () => {
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

  test('Forgot Username Flow - Successful Recovery', async ({ page }) => {

    const forgotUsernamePath = '/roadmap/forgotUsername'; // Removed .html

    // 1. Navigate to the "Forgot Username" form
    console.log(`Navigating to login page: /roadmap/login.html`);
    const loginPageResponse = await page.goto('/roadmap/login.html', { waitUntil: 'networkidle' });
    expect(loginPageResponse?.status()).toBe(200);

    console.log(`Navigating to: ${forgotUsernamePath}`);
    try {
      const response = await page.goto(forgotUsernamePath, { waitUntil: 'networkidle' }); // Wait for network to be idle
      expect(response?.status()).toBe(200);
    } catch (error: any) {
      console.error(`Navigation to ${forgotUsernamePath} failed: ${error.message}`);
      throw new Error(`Failed to navigate to ${forgotUsernamePath}: ${error.message}`);
    }

    // Ensure the email input field is visible and ready before filling
    const emailInputLocator = page.locator('form#recover input[name="email"]');
    await emailInputLocator.waitFor({ state: 'visible' });

    // 2. Fill out the form with a test user's email
    await emailInputLocator.fill(config.user.email);

    // 3. Submit the form
    const submitButtonLocator = page.locator('input[type="submit"][name="recover"]');
    await submitButtonLocator.click();

    // Wait for the login form to appear, which indicates a client-side redirect
    await page.locator('input[name="username"]').waitFor();

    // 4. Verify redirection to login page and success message
    await expect(page.locator('body', { hasText: 'Your username has been sent to your email address.' })).toBeVisible();

    // Take screenshot
    const screenshot = await page.screenshot();
    const s3PathFile = path.resolve(__dirname, 's3path.txt');
    const s3BasePath = fs.readFileSync(s3PathFile, 'utf-8');
    const filename = `forgot-username-success-${Date.now()}.png`;
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

  test('Forgot Username Flow - Invalid Email', async ({ page }) => {
    const forgotUsernamePath = '/roadmap/forgotUsername'; // Removed .html
    const invalidEmail = 'nonexistent@example.com';

    // 1. Navigate to the "Forgot Username" form
    console.log(`Navigating to login page: /roadmap/login.html`);
    const loginPageResponse = await page.goto('/roadmap/login.html', { waitUntil: 'networkidle' });
    expect(loginPageResponse?.status()).toBe(200);

    console.log(`Navigating to: ${forgotUsernamePath}`);
    const response = await page.goto(forgotUsernamePath, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    // Ensure the email input field is visible and ready before filling
    const emailInputLocator = page.locator('form#recover input[name="email"]');
    await emailInputLocator.waitFor({ state: 'visible' });

    // 2. Fill out the form with an invalid email
    await emailInputLocator.fill(invalidEmail);

    // 3. Submit the form
    const submitButtonLocator = page.locator('input[type="submit"][name="recover"]');
    await submitButtonLocator.click();

    // Wait for the login form to appear, which indicates a client-side redirect
    await page.locator('input[name="username"]').waitFor();

    // 4. Verify redirection to login page and error message
    await expect(page.locator('body', { hasText: 'No user found with that email address.' })).toBeVisible();

    // Take screenshot
    const screenshot = await page.screenshot();
    const s3PathFile = path.resolve(__dirname, 's3path.txt');
    const s3BasePath = fs.readFileSync(s3PathFile, 'utf-8');
    const filename = `forgot-username-invalid-email-${Date.now()}.png`;
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