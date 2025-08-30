import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';

const bucketName = 'higginbotham-prs-logs';
const bucketPath = 'test-snapshots';

const baseUrl = 'http://localhost:8080/roadmap'; // Target local dev server

const s3Client = new S3Client({ region: 'us-west-1' }); // Hardcode region for local testing

test('Forgot Password E2E Test', async ({ page }) => {

  const forgotPasswordPath = '/forgotPassword'; // Assuming this path based on common patterns
  const testUserEmail = 'test@example.com'; // Placeholder: Replace with an actual test user email from DB

  // 1. Navigate to the "Forgot Password" form
  const forgotPasswordUrl = `${baseUrl}${forgotPasswordPath}`;
    console.log(`Navigating to: ${forgotPasswordUrl}`);
  try {
    const response = await page.goto(forgotPasswordUrl);
    expect(response?.status()).toBe(200);
  } catch (error: any) {
    console.error(`Navigation to ${forgotPasswordUrl} failed: ${error.message}`);
    throw new Error(`Failed to navigate to ${forgotPasswordUrl}: ${error.message}`);
  }

  // 2. Fill out the form with a test user's email
  await page.locator('input[name="email"]').fill(testUserEmail);

  // 3. Submit the form
  await page.locator('button[type="submit"]').click(); // Assuming a submit button

  // 4. Verify a success message or redirection (adjust as per actual application behavior)
  // For now, we'll just check for a generic success message or URL change.
  // A more robust check would involve looking for specific text on the page or a redirect.
  await expect(page.locator('text=Password reset instructions sent')).toBeVisible(); // Placeholder assertion

  // 5. Verify that the user's password was reset and the Password_reset flag is set to 1 in the database.
  // This step requires direct database access, which will be handled outside of Playwright.
  // Placeholder for DB verification:
  console.log(`TODO: Verify database for user ${testUserEmail} to confirm password reset and Password_reset flag.`);

  // Take screenshot
  const screenshot = await page.screenshot();
  const filename = `forgot-password-test-${Date.now()}.png`;
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