## Plan

This plan outlines the steps to address the user's requirements for the CDK project.

**1. Information Gathering and Clarification:**

*   **Review Existing Code:** Examine the provided `lib/auto-start-stop-ec2-stack.ts` file content to understand the current CDK stack configuration.
*   **Examine `stack.config.json`:** Understand its structure and content, as the cron expressions are defined there.
*   **Lambda Function:** Understand how `lambda/auto-start-stop-ec2.py` determines which instances to start and stop.
*   **Dependency Versions:** Inspect `package.json` to identify the versions of CDK and other dependencies.
*   **Clarifying Questions:** Ask the user questions to clarify specific requirements and assumptions.

**2. Task Breakdown and Planning:**

*   **Add `auto-stop` Schedule for UAT:**
    *   Modify `stack.config.json` to include a new cron schedule for UAT.
    *   Update the CDK stack to use this new schedule.
*   **Add Login E2E Test:**
    *   Determine the appropriate testing framework and tools.
    *   Create a new test script that performs the login E2E test.
    *   Configure the test to run twice daily.
    *   Implement SNS notification on failure, including specific failure details.
*   **Review Dependency Versions:**
    *   Identify outdated dependencies in `package.json`.
    *   Update dependencies to the latest versions.
*   **Modernize Tooling:**
    *   Explore opportunities to use more modern and up-to-date tooling.
    *   Address the mixed Python and TypeScript code.

**3. Implementation:**

*   I will use the `read_file` tool to examine the contents of `stack.config.json`, `lambda/auto-start-stop-ec2.py`, and `package.json`.
*   I will use the `write_to_file` tool to modify `lib/auto-start-stop-ec2-stack.ts` and `stack.config.json`.
*   I will use the `execute_command` tool to run commands for installing dependencies and running tests.

**4. Questions for the User:**

*   Could you provide the content of `stack.config.json`?
*   What is the instance ID of the UAT server?
*   What is the desired region for the UAT server?
*   What testing framework would you prefer for the E2E tests (e.g., Jest, Mocha, Playwright)?
*   Do you have an existing SNS topic that I should use for the failure notifications, or should I create a new one?
*   Can you provide the login URL for the UAT environment?
*   What credentials should be used for the login E2E test?
*   What is the desired frequency for the E2E tests (e.g., 09:00 and 21:00)?

**5. Mermaid Diagram:**

```mermaid
graph TD
    A[Start] --> B{Information Gathering};
    B --> C{Review auto-start-stop-ec2-stack.ts};
    B --> D{Examine stack.config.json};
    B --> E{Inspect lambda/auto-start-stop-ec2.py};
    B --> F{Check package.json for dependencies};
    C --> G{Understand CDK Stack};
    D --> H{Understand Cron Expressions};
    E --> I{Understand Instance Logic};
    F --> J{Identify Dependency Versions};
    J --> K{Check for Outdated Dependencies};
    K --> L{Update Dependencies if Needed};
    B --> M{Ask Clarifying Questions};
    M --> N{UAT Instance ID?};
    M --> O{UAT Region?};
    M --> P{Testing Framework Preference?};
    M --> Q{Existing SNS Topic?};
    M --> R{Login URL?};
    M --> S{Login Credentials?};
    M --> T{E2E Test Frequency?};
    G --> U{Add auto-stop Schedule for UAT};
    H --> U;
    I --> V{Add Login E2E Test};
    J --> W{Review Dependency Versions};
    W --> X{Modernize Tooling};
    U --> Y{Modify stack.config.json};
    U --> Z{Update CDK Stack};
    V --> AA{Create Test Script};
    V --> BB{Configure Test Schedule};
    V --> CC{Implement SNS Notification};
    X --> DD{Explore Modern Tooling};
    Y --> EE{Write to File};
    Z --> EE;
    AA --> EE;
    BB --> EE;
    CC --> EE;
    DD --> EE;
    EE --> FF[Complete];