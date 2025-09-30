export interface TestConfig {
  user: {
    email: string;
    password: string;
    username: string;
  };
  s3: {
    bucketName: string;
    region: string;
  };
  settings: {
    env: string;
  };
}
