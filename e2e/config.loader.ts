import * as fs from 'fs';
import * as path from 'path';
import * as toml from '@iarna/toml';
import { TestConfig } from './config';

function loadConfig(): TestConfig {
  const configPath = path.resolve(__dirname, '..', 'config.toml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found at ${configPath}`);
  }

  const configFile = fs.readFileSync(configPath, 'utf-8');
  const config = toml.parse(configFile);

  // Allow environment variables to override TOML values
  const finalConfig: TestConfig = {
    user: {
      email: process.env.E2E_USER_EMAIL || config.user.email,
      password: process.env.E2E_USER_PASSWORD || config.user.password,
      username: process.env.E2E_USER_USERNAME || config.user.username,
    },
    s3: {
      bucketName: process.env.E2E_S3_BUCKETNAME || config.s3.bucketName,
      region: process.env.E2E_S3_REGION || config.s3.region,
    },
    settings: {
      env: process.env.E2E_ENV || config.settings.env,
    },
  };

  return finalConfig;
}

export const config = loadConfig();
