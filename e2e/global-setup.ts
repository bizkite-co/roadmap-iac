import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.loader';

async function globalSetup() {
  const env = config.settings.env;
  const now = new Date();
  const dateStamp = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStamp = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS

  const s3Path = `test-snapshots/${env}/${dateStamp}/${timeStamp}`;

  const s3PathFile = path.resolve(__dirname, 's3path.txt');
  fs.writeFileSync(s3PathFile, s3Path);

  console.log(`
E2E tests running in '${env}' environment.`);
  console.log(`Screenshots will be saved to S3 path: ${s3Path}
`);
}

export default globalSetup;
