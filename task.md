## Task: Improve E2E Test Failure Messages

**Description:**

Improve the E2E test failure messages to output the value of the path being tested.

**Steps:**

1.  Modify the `e2e/login.test.ts` file to include the value of the path being tested in the error message.

**Achievements:**

*   Modified the `e2e/login.test.ts` file to read the environment variables from `stack.config.json`.
*   Updated the `e2e/login.test.ts` file to use the correct locator for the login button.
*   Updated the `e2e/login.test.ts` file to use the correct region for the S3 bucket.
*   Configured the PRS account to publish to the `site-down` topic in your Bizkite account.
*   Updated the `cdk.json` file with the `snsTopicArn` context value.
*   Deployed the CDK stack successfully.
*   Corrected the `logback.xml` file to fix the Tomcat startup issue.
*   Removed the incorrect `autoStopSchedule` setting from the `prod` configuration in `stack.config.json`.
*   Modified the `lib/auto-start-stop-ec2-stack.ts` file to prevent the creation of the 5-minute start rule and add a new rule that stops and starts the PROD server based on the `prodConfig.autoStopStartSchedule`.
*   Deployed the CDK stack to apply the changes.
*   Added the stack region and account number to the `docs/cdk-outputs.yml` file.
*   Appended my achievements to the `task.md` file and created a multiline git commit.

## Next Task: Create scripts/test-infra.sh

**Description:**

Create a script `scripts/test-infra.sh` that can start Tomcat on the PROD server, verify the site's availability, and facilitate testing of the auto-start-stop schedules.

**Steps:**

1.  Create the initial version of `scripts/test-infra.sh`.
2.  Implement the core functionality for starting Tomcat and verifying the site.
3.  Add basic schedule modification and status checking capabilities.
4.  Refine the script based on testing needs and explore integration with AWS CLI testing tools.