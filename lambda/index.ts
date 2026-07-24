// This comment is added to force CDK to detect a change and re-bundle the Lambda asset.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const SECRET_NAME = process.env.SECRET_NAME;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const REPORTS_BUCKET_NAME = process.env.REPORTS_BUCKET_NAME;

const secretsManagerClient = new SecretsManagerClient({});
const snsClient = new SNSClient({});
const s3Client = new S3Client({});

exports.handler = async function(event, context) {
  const taskRoot = process.cwd(); // The root of the Lambda function's deployed code
  const playwrightReportDir = path.join(taskRoot, 'playwright-report');
  let testPassed = false;
  let reportKeyPrefix = '';

  try {
    const now = new Date();
    const dateStamp = now.toISOString().split('T')[0];
    const timeStamp = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    reportKeyPrefix = `reports/${dateStamp}/${timeStamp}`;

    const playwrightEnv = await getPlaywrightEnv(SECRET_NAME, REPORTS_BUCKET_NAME);

    // No need for setupEnvironment or installDependencies, as code is bundled
    testPassed = await runPlaywrightTests(taskRoot, playwrightReportDir, playwrightEnv);

    return {
      statusCode: 200,
      body: JSON.stringify(testPassed ? 'E2E tests passed successfully!' : 'E2E tests failed.'),
    };
  } catch (error) {
    console.error(`An error occurred during test execution: ${error.message || error}`);
    await sendSnsNotification(`E2E test execution failed.\n\nDetails:\n${error.message || error}\n\nStdout:\n${error.stdout?.toString() || ''}\n\nStderr:\n${error.stderr?.toString() || ''}`);
    return {
      statusCode: 500,
      body: JSON.stringify(`E2E test failed: ${error.message || error}`),
    };
  } finally {
    await uploadReports(playwrightReportDir, REPORTS_BUCKET_NAME, reportKeyPrefix, testPassed);
  }
}

async function getPlaywrightEnv(secretName, reportsBucketName) {
  console.log(`Fetching secret: ${secretName}`);
  const password = await getSecret(secretName);

  return {
    ...process.env,
    E2E_USER_EMAIL: "mark@bizkite.net",
    E2E_USER_USERNAME: "appdev",
    E2E_USER_PASSWORD: password,
    E2E_S3_BUCKETNAME: reportsBucketName,
    E2E_S3_REGION: process.env.AWS_REGION || 'us-west-1',
    E2E_ENV: "dev",
  };
}

async function runPlaywrightTests(taskRoot, playwrightReportDir, env) {
  console.log('Running E2E tests and generating HTML report...');
  try {
    // Playwright tests are now in a bundled 'e2e/' directory relative to taskRoot
    execSync(`npm exec playwright -- test e2e/ --output=${playwrightReportDir} --reporter=html`, { cwd: taskRoot, stdio: 'inherit', env: env });
    console.log('E2E tests passed successfully!');
    return true;
  } catch (testError) {
    console.error(`E2E tests failed: ${testError.message || testError}`);
    return false;
  }
}

async function uploadReports(playwrightReportDir, reportsBucketName, reportKeyPrefix, testPassed) {
  if (fs.existsSync(playwrightReportDir)) {
    console.log(`Uploading Playwright report from ${playwrightReportDir} to s3://${reportsBucketName}/${reportKeyPrefix}...`);
    await uploadDirectoryToS3(playwrightReportDir, reportsBucketName, reportKeyPrefix);

    const reportIndexKey = path.join(reportKeyPrefix, 'index.html');

    const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: reportsBucketName, Key: reportIndexKey }),
        { expiresIn: 3600 } // URL expires in 1 hour
    );
    
    console.log(`Playwright report available at secure pre-signed URL (valid for 1 hour): ${signedUrl}`);

    await updateReportsIndex(reportsBucketName, reportKeyPrefix, testPassed, signedUrl);

    if (!testPassed) {
      await sendSnsNotification(`E2E test execution failed. Secure report link (valid for 1 hour): ${signedUrl}`);
    }
  } else {
    console.log('Playwright report directory not found, skipping upload.');
  }
}

async function getSecret(secretName) {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsManagerClient.send(command);
    if (response.SecretString) {
      return response.SecretString;
    }
    throw new Error('SecretString not found in response.');
  } catch (error) {
    console.error(`Failed to retrieve secret '${secretName}': ${error.message}`);
    throw error;
  }
}

async function updateReportsIndex(bucketName, reportKeyPrefix, passed, reportUrl) {
  const indexKey = 'reports-index.json';
  let reports = [];

  try {
    const { Body } = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: indexKey,
    }));
    if (Body) {
      const content = await Body.transformToString();
      reports = JSON.parse(content);
    }
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      console.log(`'${indexKey}' not found. Creating new index.`);
    } else {
      console.error(`Error reading '${indexKey}': ${error.message}`);
    }
  }

  const newEntry = {
    timestamp: new Date().toISOString(),
    status: passed ? 'Passed' : 'Failed',
    reportPath: `${reportKeyPrefix}/index.html`,
    reportUrl: reportUrl,
  };

  reports.unshift(newEntry);

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: indexKey,
      ContentType: 'application/json',
      Body: JSON.stringify(reports, null, 2),
    }));
    console.log(`Updated '${indexKey}' in s3://${bucketName}`);
  } catch (error) {
    console.error(`Error writing '${indexKey}': ${error.message}`);
  }
}

async function uploadDirectoryToS3(directoryPath, bucketName, prefix = '') {
  const files = fs.readdirSync(directoryPath);

  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const s3Key = path.join(prefix, file);

    if (fs.statSync(filePath).isDirectory()) {
      await uploadDirectoryToS3(filePath, bucketName, s3Key);
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

function getContentType(filePath) {
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

async function sendSnsNotification(message) {
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
  } catch (error) {
    console.error(`Failed to send SNS notification: ${error.message}`);
  }
}
