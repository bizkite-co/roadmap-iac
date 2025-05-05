# Test info

- Name: Login E2E Test
- Location: /home/mstouffer/repos/prs/auto-start-stop-ec2/e2e/login.test.ts:10:5

# Error details

```
Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://roadmapparters.net/roadmap/login.html
Call log:
  - navigating to "https://roadmapparters.net/roadmap/login.html", waiting until "load"

    at /home/mstouffer/repos/prs/auto-start-stop-ec2/e2e/login.test.ts:18:14
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 | import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
   3 | import * as fs from 'fs';
   4 |
   5 | const bucketName = 'higginbotham-prs-logs';
   6 | const bucketPath = 'test-snapshots';
   7 |
   8 | const s3Client = new S3Client({ region: 'us-west-2' }); // Replace with your region
   9 |
  10 | test('Login E2E Test', async ({ page }) => {
  11 |   const baseUrl = process.env.BASE_URL || '';
  12 |   const loginPath = process.env.LOGIN_PATH || '';
  13 |   const welcomePath = process.env.WELCOME_PATH || '';
  14 |   const clientProfilePath = process.env.CLIENT_PROFILE_PATH || '';
  15 |   const collegePlannerPath = process.env.COLLEGE_PLANNER_PATH || '';
  16 |
  17 |   // 1. Go to login page
> 18 |   await page.goto(`${baseUrl}${loginPath}`);
     |              ^ Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://roadmapparters.net/roadmap/login.html
  19 |
  20 |   // 2. Fill in username and password
  21 |   await page.locator('input[name="username"]').fill(process.env.ROADMAP_USERNAME || '');
  22 |   await page.locator('input[name="password"]').fill(process.env.ROADMAP_PASSWORD || '');
  23 |
  24 |   // 3. Click login button
  25 |   await page.locator('button[type="submit"]').click();
  26 |
  27 |   // 4. Assert successful login
  28 |   await expect(page).toHaveURL(`${baseUrl}${welcomePath}`);
  29 |
  30 |   // 5. Navigate to Profile page
  31 |   await page.goto(`${baseUrl}${clientProfilePath}`);
  32 |
  33 |   // 6. Navigate to Settings page
  34 |   await page.goto(`${baseUrl}${collegePlannerPath}`);
  35 |
  36 |   // Take screenshot
  37 |   const screenshot = await page.screenshot();
  38 |   const filename = `login-test-${Date.now()}.png`;
  39 |   const filePath = `${bucketPath}/${filename}`;
  40 |
  41 |   // Upload screenshot to S3
  42 |   try {
  43 |     const uploadParams = {
  44 |       Bucket: bucketName,
  45 |       Key: filePath,
  46 |       Body: screenshot,
  47 |       ContentType: 'image/png',
  48 |     };
  49 |
  50 |     const command = new PutObjectCommand(uploadParams);
  51 |     await s3Client.send(command);
  52 |
  53 |     console.log(`Screenshot uploaded to s3://${bucketName}/${filePath}`);
  54 |   } catch (error) {
  55 |     console.error('Error uploading screenshot to S3:', error);
  56 |   }
  57 | });
```