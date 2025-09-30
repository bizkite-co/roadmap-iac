import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.loader';

const s3Client = new S3Client({ region: config.s3.region });

test('Login E2E Test', async ({ page }) => {
  // 1. Go to login page
  // Note: Base URL is now expected to be set in playwright.config.ts
  await page.goto('/roadmap/');

  // 2. Fill in username and password
  await page.locator('input[name="username"]').fill(config.user.username);
  await page.locator('input[name="password"]').fill(config.user.password);

  // 3. Click login button
  await page.locator('input[type="submit"].darkblue.largebtn.xllogin').click();

  // 4. Assert successful login
  await expect(page).toHaveURL(/.*prsWelcome\.html/);

  // Take screenshot
  const screenshot = await page.screenshot();
  const s3PathFile = path.resolve(__dirname, 's3path.txt');
  const s3BasePath = fs.readFileSync(s3PathFile, 'utf-8');
  const filename = `login-test-${Date.now()}.png`;
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