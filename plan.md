# Plan for Auto-Start-Stop EC2 Instances

## Goal

To ensure that the PROD EC2 instance is only stopped and started on Friday nights at 7:00 AM UTC for AWS maintenance, and that the UAT EC2 instance continues to be stopped and started based on the `uatConfig.autoStopSchedule`.

## Current Status

The `autoStopSchedule` setting in `stack.config.json` is not being respected, and both servers are being stopped each night. The website is also not running reliably after the EC2 instance is started.

## Steps

1.  **Fix the `deploy_prod.sh` script to properly deploy the application:**
    *   The `deploy_prod.sh` script should not build the WAR file. It should deploy the WAR file that was already tested in UAT.
    *   The `deploy_prod.sh` script should use the `scripts/copy_if_different.sh` script to copy the `roadmap.war`, `setenv.sh`, and `logback.xml` files to the PROD server only if they have changed.
    *   The `deploy_prod.sh` script should use a temporary directory on the PROD server to store the files before moving them to their final destination.
    *   The `deploy_prod.sh` script should include a step to start Tomcat on the PROD server after copying the files.
    *   The `deploy_prod.sh` script should use SSH to connect to the PROD server if the public IP address is in the whitelist, and SSM if it is not.
2.  **Create a short REPL to test the infrastructure:**
    *   Create a script `scripts/test-infra.sh` that allows us to:
        *   Start PROD.
        *   Check that the site is running.
        *   Modify the published schedule to be triggered in one or two minutes.
        *   Check if the site is running again a minute after that.
3.  **Manage alarms and alerts through the CDK:**
    *   Investigate the existing alarms and alerts for the PROD server.
    *   Determine how to manage these alarms and alerts through the CDK.
    *   Implement the necessary changes in the CDK stack.
4.  **Consolidate the stacks into this auto-stop-start repo:**
    *   Move the deployment pipeline CDK from the `roadmap-website` repo to this repo.
    *   Move any relevant scripts from the `roadmap-website.wiki/dev-ops` directory to this repo.
    *   Update the CDK stack to include all the necessary resources.

## Next Steps

1.  Modify the `deploy_prod.sh` script to use the `scripts/copy_if_different.sh` script to copy the files to the PROD server.
2.  Modify the `deploy_prod.sh` script to add a step to start Tomcat on the PROD server after copying the files.
3.  Test the `deploy_prod.sh` script to ensure that it is working correctly.
4.  Create the `scripts/test-infra.sh` script.
5.  Investigate the existing alarms and alerts for the PROD server.
6.  Determine how to manage these alarms and alerts through the CDK.
7.  Create a GH Issue to track the progress of this task.

## Considerations

*   The `deploy_prod.sh` script should be as efficient as possible to minimize downtime.
*   The deployment process should be automated as much as possible.
*   The alarms and alerts should be managed through the CDK to ensure that they are consistent and up-to-date.
*   The code should be well-documented and easy to understand.

## Unresolved Questions

*   What is the best way to manage the alarms and alerts through the CDK?
*   What is the best way to test the infrastructure changes?
*   What is the best way to handle the dependencies between the different stacks?