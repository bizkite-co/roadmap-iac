import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

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
  let reportKeyPrefix = '';
  let finalReportUrl = '';

  try {
    // Generate a unique prefix for this report run
    const now = new Date();
    const dateStamp = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStamp = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    reportKeyPrefix = `reports/${dateStamp}/${timeStamp}`;

    await setupEnvironment(tmpDir, GIT_REPO_URL);

    const playwrightEnv = await getPlaywrightEnv(SECRET_NAME, REPORTS_BUCKET_NAME);

    await installDependencies(tmpDir, playwrightEnv);

    testPassed = await runPlaywrightTests(tmpDir, playwrightReportDir, playwrightEnv);

    return {
      statusCode: 200,
      body: JSON.stringify(testPassed ? 'E2E tests passed successfully!' : 'E2E tests failed.'),
    };
  } catch (error: any) {
    console.error(`An error occurred during test execution: ${error.message || error}`);
    await sendSnsNotification(`E2E test execution failed.\n\nDetails:\n${error.message || error}\n\nStdout:\n${error.stdout?.toString() || ''}\n\nStderr:\n${error.stderr?.toString() || ''}`);
    return {
      statusCode: 500,
      body: JSON.stringify(`E2E test failed: ${error.message || error}`),
    };
  } finally {
    await uploadReports(playwrightReportDir, REPORTS_BUCKET_NAME, reportKeyPrefix, testPassed, finalReportUrl);
  }
}

// Helper Functions

async function setupEnvironment(tmpDir: string, gitRepoUrl: string): Promise<void> {
  console.log('Cleaning up /tmp/repo...');
  execSync(`rm -rf ${tmpDir}`);
  execSync(`mkdir -p ${tmpDir}`);

  console.log(`Cloning repository: ${gitRepoUrl}`);
  execSync(`git clone ${gitRepoUrl} ${tmpDir}`);
}

async function getPlaywrightEnv(secretName: string, reportsBucketName: string): Promise<NodeJS.ProcessEnv> {
  console.log(`Fetching secret: ${secretName}`);
  const password = await getSecret(secretName);

  return {
    ...process.env, // Inherit existing Lambda environment variables
    E2E_USER_EMAIL: "test@bizkite.net", // Hardcoded for now, could be from Secrets Manager
    E2E_USER_USERNAME: "appdev", // Hardcoded for now, could be from Secrets Manager
    E2E_USER_PASSWORD: password,
    E2E_S3_BUCKETNAME: reportsBucketName,
    E2E_S3_REGION: process.env.AWS_REGION || 'us-west-1', // Default to us-west-1 if not set
    E2E_ENV: "dev", // Hardcoded for now, could be from CDK context
  };
}

async function installDependencies(tmpDir: string, env: NodeJS.ProcessEnv): Promise<void> {
  console.log('Installing npm dependencies...');
  execSync('npm install', { cwd: tmpDir, stdio: 'inherit', env: env });
}

async function runPlaywrightTests(tmpDir: string, playwrightReportDir: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  console.log('Running E2E tests and generating HTML report...');
  try {
    execSync(`npm exec playwright -- test e2e/ --output=${playwrightReportDir} --reporter=html`, { cwd: tmpDir, stdio: 'inherit', env: env });
    console.log('E2E tests passed successfully!');
    return true;
  } catch (testError: any) {
    console.error(`E2E tests failed: ${testError.message || testError}`);
    return false;
  }
}

async function uploadReports(playwrightReportDir: string, reportsBucketName: string, reportKeyPrefix: string, testPassed: boolean, finalReportUrl: string): Promise<void> {
  if (fs.existsSync(playwrightReportDir)) {
    console.log(`Uploading Playwright report from ${playwrightReportDir} to s3://${reportsBucketName}/${reportKeyPrefix}...`);
    await uploadDirectoryToS3(playwrightReportDir, reportsBucketName, reportKeyPrefix);
    finalReportUrl = `http://${reportsBucketName}.s3-website.${process.env.AWS_REGION}.amazonaws.com/${reportKeyPrefix}/index.html`;
    console.log(`Playwright report available at: ${finalReportUrl}`);

    await updateReportsIndex(reportsBucketName, reportKeyPrefix, testPassed, finalReportUrl);

    if (!testPassed) {
      await sendSnsNotification(`E2E test execution failed. Report available at: ${finalReportUrl}`);
    }
  } else {
    console.log('Playwright report directory not found, skipping upload.');
  }
}

async function getSecret(secretName: string): Promise<string> {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsManagerClient.send(command);
    if (response.SecretString) {
      return response.SecretString;
    }
    throw new Error('SecretString not found in response.');
  } catch (error: any) {
    console.error(`Failed to retrieve secret '${secretName}': ${error.message}`);
    throw error;
  }
}

interface ReportEntry {
  timestamp: string;
  status: string;
  reportPath: string;
  reportUrl: string;
  // Add other metadata like duration, browser, etc. if needed
}

async function updateReportsIndex(bucketName: string, reportKeyPrefix: string, passed: boolean, reportUrl: string): Promise<void> {
  const indexKey = 'reports-index.json';
  let reports: ReportEntry[] = [];

  try {
    const { Body } = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: indexKey,
    }));
    if (Body) {
      const content = await Body.transformToString();
      reports = JSON.parse(content);
    }
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      console.log(`'${indexKey}' not found. Creating new index.`);
    } else {
      console.error(`Error reading '${indexKey}': ${error.message}`);
    }
  }

  const newEntry: ReportEntry = {
    timestamp: new Date().toISOString(),
    status: passed ? 'Passed' : 'Failed',
    reportPath: `${reportKeyPrefix}/index.html`,
    reportUrl: reportUrl,
  };

  reports.unshift(newEntry); // Add new entry to the beginning

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: indexKey,
      ContentType: 'application/json',
      Body: JSON.stringify(reports, null, 2),
    }));
    console.log(`Updated '${indexKey}' in s3://${bucketName}`);
  } catch (error: any) {
    console.error(`Error writing '${indexKey}': ${error.message}`);
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
