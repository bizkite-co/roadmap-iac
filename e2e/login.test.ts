import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';

const bucketName = 'higginbotham-prs-logs';
const bucketPath = 'test-snapshots';

const config = require('../stack.config.json').prod; // Load the configuration

const s3Client = new S3Client({ region: config.region }); // Replace with your region

test('Login E2E Test', async ({ page }) => {
  const baseUrl = config.baseUrl || '';
  const loginPath = config.loginPath || '';
  const welcomePath = config.welcomePath || '';
  const clientProfilePath = config.clientProfilePath || '';
  const collegePlannerPath = config.collegePlannerPath || '';

  // 1. Go to login page
  const loginUrl = `${baseUrl}${loginPath}`;
  try {
    await page.goto(loginUrl);
  } catch (error: any) {
    console.error(`Navigation to ${loginUrl} failed: ${error.message}`);
    throw new Error(`Failed to navigate to ${loginUrl}: ${error.message}`);
  }

  // 2. Fill in username and password
  await page.locator('input[name="username"]').fill(process.env.ROADMAP_USERNAME || '');
  await page.locator('input[name="password"]').fill(process.env.ROADMAP_PASSWORD || '');

  // 3. Click login button
  await page.locator('input[type="submit"].darkblue.largebtn.xllogin').click();

  // 4. Assert successful login
  const welcomeUrl = `${baseUrl}${welcomePath}`;
  try {
    await expect(page).toHaveURL(welcomeUrl);
  } catch (error) {
    console.error(`Login failed. Expected URL: ${welcomeUrl}, Actual URL: ${page.url()}`);
    throw error;
  }

  // 5. Navigate to Profile page
  const clientProfileUrl = `${baseUrl}${clientProfilePath}`;
  await page.goto(clientProfileUrl);

  // 6. Navigate to Settings page
  const collegePlannerUrl = `${baseUrl}${collegePlannerPath}`;
  await page.goto(collegePlannerUrl);

  // Take screenshot
  const screenshot = await page.screenshot();
  const filename = `login-test-${Date.now()}.png`;
  const filePath = `${bucketPath}/${filename}`;

  // Upload screenshot to S3
  try {
    const uploadParams = {
      Bucket: bucketName,
      Key: filePath,
      Body: screenshot,
      ContentType: 'image/png',
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    console.log(`Screenshot uploaded to s3://${bucketName}/${filePath}`);
  } catch (error) {
    console.error('Error uploading screenshot to S3:', error);
  }
});