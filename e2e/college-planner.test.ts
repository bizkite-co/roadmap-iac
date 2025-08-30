import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';

const bucketName = 'higginbotham-prs-logs';
const bucketPath = 'test-snapshots';

const config = require('../stack.config.json').prod; // Load the configuration

const s3Client = new S3Client({ region: config.region });

test('College Planner E2E Test', async ({ page }) => {
  const baseUrl = config.baseUrl || '';
  const loginPath = config.loginPath || '';
  const welcomePath = config.welcomePath || '';
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

  // 5. Navigate to the "College Planner" tab
  const collegePlannerUrl = `${baseUrl}${collegePlannerPath}`;
  await page.goto(collegePlannerUrl);

  // 6. Fill in data for two children (placeholders)
  // Child 1
  await page.locator('#child1Name').fill('Child One');
  await page.locator('#child1Age').fill('5');
  await page.locator('#child1CollegeCost').fill('50000');

  // Child 2
  await page.locator('#child2Name').fill('Child Two');
  await page.locator('#child2Age').fill('3');
  await page.locator('#child2CollegeCost').fill('60000');

  // 7. Click the "Calculate" button
  await page.locator('#calculateButton').click(); // Assuming an ID for the calculate button

  // 8. Verify that both children's data appears correctly on the page (placeholders)
  await expect(page.locator('text=Child One')).toBeVisible();
  await expect(page.locator('text=Child Two')).toBeVisible();
  await expect(page.locator('text=$50,000')).toBeVisible(); // Assuming formatted output
  await expect(page.locator('text=$60,000')).toBeVisible();

  // 9. Verify that the combined summary data appears correctly on the page (placeholder)
  await expect(page.locator('text=Total College Cost: $110,000')).toBeVisible(); // Assuming a summary element

  // Take screenshot
  const screenshot = await page.screenshot();
  const filename = `college-planner-test-${Date.now()}.png`;
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