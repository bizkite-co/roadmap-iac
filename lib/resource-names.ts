export class ResourceNames {
  private readonly root: string = "roadmap";
  private readonly environment: string;

  constructor(environment: string) {
    this.environment = environment;
  }

  // E2E Test Stack Names
  public get e2eTestStack() {
    const subdomain = "e2e-test-runner";

    return {
      lambdaFunction: `${this.root}-${this.environment}-${subdomain}-lambda`,
      logGroup: `${this.root}-${this.environment}-${subdomain}-lambda-log-group`, 
      s3Bucket: `${this.root}-${this.environment}-${subdomain}-reports`,
      snsTopic: `${this.root}-${this.environment}-${subdomain}-notifications`,
      scheduleRule: `${this.root}-${this.environment}-${subdomain}-schedule`,
      debugScheduleRule: `${this.root}-${this.environment}-${subdomain}-debug-schedule`,
    };
  }

  // Add other stack/service naming conventions here
  // public get anotherService() { ... }
}
