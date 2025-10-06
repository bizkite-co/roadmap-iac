import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface LambdaEvent {}
interface LambdaContext {}

const GIT_REPO_URL = process.env.GIT_REPO_URL!;
const SECRET_NAME = process.env.SECRET_NAME!;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const REPORTS_BUCKET_NAME = process.env.REPORTS_BUCKET_NAME!;

const secretsManagerClient = new SecretsManagerClient({});
const snsClient = new SNSClient({});
const s3Client = new S3Client({});

export async function handler(event: LambdaEvent, context: LambdaContext) {
  const tmpDir = '/tmp/repo';
  const playwrightReportDir = path.join(tmpDir, 'playwright-report');
  let testPassed = false;

  try {
    // Clean and create temporary directory
    console.log('Cleaning up /tmp/repo...');
    execSync(`rm -rf ${tmpDir}`);
    execSync(`mkdir -p ${tmpDir}`);

    // Clone the repository
    console.log(`Cloning repository: ${GIT_REPO_URL}`);
    execSync(`git clone ${GIT_REPO_URL} ${tmpDir}`);

    // Fetch credentials from Secrets Manager
    console.log(`Fetching secret: ${SECRET_NAME}`);
    const password = await getSecret(SECRET_NAME);

    // Prepare environment variables for Playwright
    const playwrightEnv = {
      ...process.env, // Inherit existing Lambda environment variables
      E2E_USER_EMAIL: "mark@bizkite.net", // Hardcoded for now, could be from Secrets Manager
      E2E_USER_USERNAME: "appdev", // Hardcoded for now, could be from Secrets Manager
      E2E_USER_PASSWORD: password,
      E2E_S3_BUCKETNAME: REPORTS_BUCKET_NAME,
      E2E_S3_REGION: process.env.AWS_REGION || 'us-west-1', // Default to us-west-1 if not set
      E2E_ENV: "dev", // Hardcoded for now, could be from CDK context
    };

    // Install dependencies
    console.log('Installing npm dependencies...');
    execSync('npm install', { cwd: tmpDir, stdio: 'inherit', env: playwrightEnv });

    // Run the tests and generate HTML report
    console.log('Running E2E tests and generating HTML report...');
    try {
      execSync(`npm exec playwright -- test e2e/ --output=${playwrightReportDir} --reporter=html`, { cwd: tmpDir, stdio: 'inherit', env: playwrightEnv });
      testPassed = true;
      console.log('E2E tests passed successfully!');
    } catch (testError: any) {
      console.error(`E2E tests failed: ${testError.message || testError}`);
      throw testError; // Re-throw to be caught by outer catch block
    }

    return {
      statusCode: 200,
      body: JSON.stringify('E2E tests passed successfully!'),
    };
  } catch (error: any) {
    console.error(`An error occurred during test execution: ${error.message || error}`);
    await sendSnsNotification(`E2E test execution failed.\n\nDetails:\n${error.message || error}\n\nStdout:\n${error.stdout?.toString() || ''}\n\nStderr:\n${error.stderr?.toString() || ''}`);
    return {
      statusCode: 500,
      body: JSON.stringify(`E2E test failed: ${error.message || error}`),
    };
  } finally {
    // Always upload reports, regardless of test success or failure
    if (fs.existsSync(playwrightReportDir)) {
      console.log(`Uploading Playwright report from ${playwrightReportDir} to s3://${REPORTS_BUCKET_NAME}...`);
      await uploadDirectoryToS3(playwrightReportDir, REPORTS_BUCKET_NAME);
      const reportUrl = `http://${REPORTS_BUCKET_NAME}.s3-website.${process.env.AWS_REGION}.amazonaws.com/`;
      console.log(`Playwright report available at: ${reportUrl}`);
      if (!testPassed) {
        await sendSnsNotification(`E2E test execution failed. Report available at: ${reportUrl}`);
      }
    } else {
      console.log('Playwright report directory not found, skipping upload.');
    }
  }
}

async function getSecret(secretName: string): Promise<string> {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsManagerClient.send(command);
    if (response.SecretString) {
      return response.SecretString;
    } else {
      throw new Error('SecretString not found in response.');
    }
  } catch (error: any) {
    console.error(`Failed to retrieve secret '${secretName}': ${error.message}`);
    throw error;
  }
}

async function uploadDirectoryToS3(directoryPath: string, bucketName: string, prefix: string = ''): Promise<void> {
  const files = fs.readdirSync(directoryPath);

  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const s3Key = path.join(prefix, file);

    if (fs.statSync(filePath).isDirectory()) {
      await uploadDirectoryToS3(filePath, bucketName, s3Key); // Recurse for subdirectories
    } else {
      const fileContent = fs.readFileSync(filePath);
      const contentType = getContentType(filePath);

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: contentType,
      });
      await s3Client.send(command);
      console.log(`Uploaded ${s3Key} to s3://${bucketName}`);
    }
  }
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html';
    case '.css': return 'text/css';
    case '.js': return 'application/javascript';
    case '.json': return 'application/json';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    case '.ttf': return 'font/ttf';
    case '.eot': return 'application/vnd.ms-fontobject';
    default: return 'application/octet-stream';
  }
}

async function sendSnsNotification(message: string): Promise<void> {
  if (!SNS_TOPIC_ARN) {
    console.log('SNS_TOPIC_ARN not set. Skipping notification.');
    return;
  }

  console.log('Sending SNS failure notification...');
  try {
    const command = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: message,
      Subject: 'E2E Test Run Failed',
    });
    await snsClient.send(command);
    console.log('SNS notification sent.');
  } catch (error: any) {
    console.error(`Failed to send SNS notification: ${error.message}`);
  }
}
