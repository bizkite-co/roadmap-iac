import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.loader';

const s3Client = new S3Client({ region: config.s3.region });

test('College Planner E2E Test', async ({ page }) => {
  // 1. Go to login page
  await page.goto('/roadmap/');

  // 2. Fill in username and password
  await page.locator('input[name="username"]').fill(config.user.username);
  await page.locator('input[name="password"]').fill(config.user.password);

  // 3. Click login button
  await page.locator('input[type="submit"].darkblue.largebtn.xllogin').click();

  // 4. Assert successful login
  await expect(page).toHaveURL(/.*prsWelcome\.html/);

  // 5. Navigate to the "College Planner" tab by clicking the link
  await page.getByRole('link', { name: /College Planner/i }).click();
  console.log('--- College Planner Page Content ---');
  console.log(await page.content());

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
  const s3PathFile = path.resolve(__dirname, 's3path.txt');
  const s3BasePath = fs.readFileSync(s3PathFile, 'utf-8');
  const filename = `college-planner-test-${Date.now()}.png`;
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