# Task: Debugging and Fixing 404 Error in Forgot Password Test

## Description
The `e2e/forgot-password.test.ts` is failing with a 404 error, leading to a test timeout. This task involves two main objectives:
1.  Modify the test to fail faster by explicitly checking for a 200 status code after navigation.
2.  Identify and fix the root cause of the 404 error for the "Forgot Password" page.

## Current Context and Debugging Progress (as of 2025-08-30T05:45:56.392Z)

### 1. E2E Test (`e2e/forgot-password.test.ts`)
-   The test has been modified to target the local development server (`http://localhost:8080/roadmap`).
-   It now explicitly asserts for a `200` status code after `page.goto(forgotPasswordUrl)`.
-   The `forgotPasswordPath` has been corrected to `/forgotPassword` (without `.html`).

### 2. Deployment Process (`make deploy-dev` / `startup_debug.sh`)
-   The `make deploy-dev` command (which executes `../roadmap-website/startup_debug.sh`) is now running successfully.
-   The `startup_debug.sh` script correctly sets `JAVA_HOME` (`/usr/lib/jvm/java-17-openjdk-amd64`) and `CATALINA_HOME` (`/opt/tomcat`).
-   The Gradle build completes successfully, and the `roadmap.war` file is deployed to `/opt/tomcat/webapps/roadmap.war`.
-   Tomcat is restarted, and the `roadmap.war` is unpacked.
-   A debug message added to `LogInController.java` (`DEBUG_TIMESTAMP_20250829_1835`) is present in the decompiled `LogInController.class` and appears in `catalina.out`, confirming that the Spring application context is loading and the `LogInController` is being instantiated and its methods executed for the `/login.html` page.

### 3. Server-Side Issue: `GenericController.java` and Thymeleaf Error
-   The `e2e/forgot-password.test.ts` still receives a `404` error when navigating to `http://localhost:8080/roadmap/forgotPassword`.
-   The application logs (`/opt/tomcat/logs/application.log`) consistently show a Thymeleaf rendering error for `recovery/forgotPassword:29`: "Neither BindingResult nor plain target object for bean name 'email' available as request attribute".
-   The `GenericController.java` source file was modified to:
    -   Add `import org.springframework.validation.BindingResult;` and `import org.springframework.web.bind.annotation.ModelAttribute;`.
    -   Change the `forgotPassword` GET method signature to `public String forgotPassword(@ModelAttribute("email") EmailRequest email, BindingResult bindingResult, Model model)`.
    -   Add `model.addAttribute("email", new EmailRequest());` to the model.
    -   Add a `log.debug` statement to the constructor and the `forgotPassword` method.
-   **CRITICAL FINDING**: `javap` analysis of the deployed `GenericController.class` in `/opt/tomcat/webapps/roadmap/WEB-INF/classes/com/roadmap/web/controller/GenericController.class` indicates that the changes made to the source file (specifically the `new EmailRequest()` and the updated method signature) are *not* present in the compiled class. This means the `GenericController.java` is *not being correctly recompiled* by the Gradle build process.
-   **NEW FINDING**: The `forgotPassword` page *renders* when accessed manually (deployed version `1.0.8.119`), but with subsequent errors. This contradicts the `404` observed by the E2E test, suggesting a difference in how the E2E test interacts with the page versus manual browsing, or a transient state.

### 4. New Error: HTTP Status 400 – Bad Request on Form Submission
-   When clicking the "Recover" button on the `forgotPassword` form, the browser shows an `HTTP Status 400 – Bad Request` with the message "Required String parameter 'email' is not present".
-   The browser console logs `POST http://localhost:8080/roadmap/forgotPassword 400 (Bad Request)`.
-   This 400 error is *not* logged to `catalina.out` or `application.log`.

### 5. Logging Configuration Issues
-   `System.out.println` and `log.debug` statements are routed to `catalina.out`, not `application.log`.
-   The `application.log` shows `_IS_UNDEFINED` content (e.g., `springAppName_IS_UNDEFINED`, `PID_IS_UNDEFINED`), which needs to be addressed for better log readability.
-   There is a need to integrate the code version from `src/main/resources/version.properties` into log messages.
-   **NEW IDEA**: Playwright browser logs and console features could capture these errors. We could check these logs only in the FAIL case, displaying the latest pertinent data in the fail message.

## Next Steps for Debugging and Fixing

1.  **Address the `HTTP Status 400 – Bad Request` on Form Submission**:
    *   This error ("Required String parameter 'email' is not present") indicates that the `handleForgotPassword` POST method in `GenericController.java` is expecting a `@RequestParam String email`, but the form submission is not providing it.
    *   Examine `recovery/forgotPassword.html` to ensure the form input for email is correctly named and submitted.
    *   Consider changing the `handleForgotPassword` POST method to accept `@ModelAttribute("email") EmailRequest email, BindingResult bindingResult` to match the GET method's model attribute.

2.  **Force Complete Recompilation of `GenericController.java`**:
    *   The `javap` output for `GenericController.class` still indicates that the changes to the source file are not present in the compiled class. This needs to be resolved.
    *   Manually delete the compiled `GenericController.class` file from `../roadmap-website/build/classes/java/main/com/roadmap/web/controller/` (and potentially `../roadmap-website/build/libs/roadmap.war` and `/opt/tomcat/webapps/roadmap/` to ensure a clean slate).
    *   Clear Gradle caches (`~/.gradle/caches`).
    *   Re-run `make deploy-dev` in `../roadmap-website`.
    *   Verify the decompiled `GenericController.class` again using `javap` to confirm the presence of the changes.

3.  **Re-run Playwright Test**:
    *   If the compilation issue is resolved and the `GenericController.class` is updated, and the 400 error is addressed, run the `e2e/forgot-password.test.ts` again to confirm the 404 is resolved and the page renders correctly.

4.  **Implement Logging Improvements**:
    *   Investigate how to configure Logback (via `tomcat/lib/logback.xml` or other Spring logging configuration) to:
        *   Include the application version from `src/main/resources/version.properties` in log messages.
        *   Resolve `_IS_UNDEFINED` placeholders in log messages.
        *   Ensure `log.debug` statements appear in `application.log` if desired, or clarify that `catalina.out` is the intended destination for console output.
        *   Integrate Playwright browser logs and console output into test failure messages.
