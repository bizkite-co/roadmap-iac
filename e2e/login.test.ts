import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';

const bucketName = 'higginbotham-prs-logs';
const bucketPath = 'test-snapshots';

const s3Client = new S3Client({ region: 'us-west-2' }); // Replace with your region

test('Login E2E Test', async ({ page }) => {
  const baseUrl = process.env.BASE_URL || '';
  const loginPath = process.env.LOGIN_PATH || '';
  const welcomePath = process.env.WELCOME_PATH || '';
  const clientProfilePath = process.env.CLIENT_PROFILE_PATH || '';
  const collegePlannerPath = process.env.COLLEGE_PLANNER_PATH || '';

  // 1. Go to login page
  await page.goto(`${baseUrl}${loginPath}`);

  // 2. Fill in username and password
  await page.locator('input[name="username"]').fill(process.env.ROADMAP_USERNAME || '');
  await page.locator('input[name="password"]').fill(process.env.ROADMAP_PASSWORD || '');

  // 3. Click login button
  await page.locator('button[type="submit"]').click();

  // 4. Assert successful login
  await expect(page).toHaveURL(`${baseUrl}${welcomePath}`);

  // 5. Navigate to Profile page
  await page.goto(`${baseUrl}${clientProfilePath}`);

  // 6. Navigate to Settings page
  await page.goto(`${baseUrl}${collegePlannerPath}`);

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