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

## Next Task: Modify deploy_prod.sh to use copy_if_different.sh

**Description:**

Modify the `deploy_prod.sh` script to use the `scripts/copy_if_different.sh` script to copy the `roadmap.war`, `setenv.sh`, and `logback.xml` files to the PROD server only if they have changed.

**Steps:**

1.  Modify the `deploy_prod.sh` script to use the `scripts/copy_if_different.sh` script to copy the files to the PROD server.
*   Modified the `../roadmap-website/deploy_prod.sh` script to use `../auto-start-stop-ec2/scripts/copy_if_different.sh` for copying `roadmap.war`, `setenv.sh`, and `logback.xml`.
*   Corrected the `../auto-start-stop-ec2/scripts/copy_if_different.sh` script to compare hashes of the local file and the remote destination file.
*   Updated the `../roadmap-website/deploy_prod.sh` script to correctly retrieve the remote version from the WAR file using SSM.
*   Removed the unnecessary `mv` command from `../roadmap-website/deploy_prod.sh`.