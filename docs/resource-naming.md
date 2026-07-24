# Resource Naming

We need to strictly formalize resource naming to obviate the need to query the server for names.

## The Problem Statement

We are not connecting the dots with our stack naming.

WE ARE FAILING to connect the dots.

We should create a JSON or TypeScript static type of all the names we are using. We should not be guessing, and we don't have to query the
server for most of these. We can CHOOSE the names we want and we can SET how they are associated before we push the stack.

Somewhere, somehow, we can create an object which is our repository of proper names and connections. There must be something integrated into
the CDK for doing this, but if there isn't we have to create an object or a class which determines the proper names.

The reason I say this is because we can't even find the log for the lambda we created and that WE NEED the log for. Duh.

The best way to resolve this is to simply decide what the log name should be, and we were supposed to have done that, but some part of our
implementation dislocated, or dis-integrated.

I am looking at the log here: `arn:aws:logs:us-west-1:865664998993:log-group:/roadmap/prod/roadmap-e2e-test-runner-log-group:*`

Why does that look different than the value you just fetched? We do we even have to fetch the name? The only time we should be fetching the
name is to debug our name-setting process. Once we get the name-setting process working properly, we should already have the name. We need to
do that for every resource created by the CDK. We shouldn't need meaningless random strings covering our names like this
`19B7CB52-FLVZTqMbHrn3`. That's low-information clutter and it distracts from the meaningful part of the name.

Let's use a domain hierarchy naming convention for our CDK resources. So, the root of the hierarchy will be `/roadmap`, and then the
environment, like `uat/` or `prod/`, and then the logical subdomain, in this case `e2e-test-stack/runner-lambda/log-group/`.

The best place to store such a hierarchy is in ... up to your architectural expertise.

## The Solution

We could use Effect Schema or some equally strict model-naming object.

We need an object that does nothing but provide names for the resources that the CDK creates.

*   It should be used for all names.
*   It should handle name composition.
    *   We should be able to construct leaf names from the trunk names so that if the root, trunk, or branch name changes, we don't have to edit the leaf. The updated name should cascade out from the root to the leaf. This should be simple to implement in most hierarchical models or types.

### Proposed TypeScript Naming Class Structure

To achieve consistent and predictable resource naming, we will implement a TypeScript class that acts as a central repository for all resource names. This class will enforce a hierarchical naming convention and provide methods for composing full resource names from their constituent parts.

**Class Structure Principles:**

1.  **Centralized Definition:** All resource name components (root, environment, subdomain, resource type, specific resource identifier) will be defined within this class.
2.  **Hierarchical Composition:** The class will provide properties or methods that allow for the construction of full resource names by combining these components. Changes to a higher-level component (e.g., environment) will automatically propagate to all derived names.
3.  **Environment Awareness:** The class will be initialized with the current environment (e.g., `prod`, `uat`, `dev`) to ensure environment-specific naming.
4.  **Read-Only Access:** Resource names should be exposed as read-only properties to prevent accidental modification.
5.  **Clear Separation of Concerns:** The naming class should *only* be responsible for generating names, not for creating or managing the resources themselves.

**Example Implementation (Conceptual):**

```typescript
// lib/resource-names.ts

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

// Usage in CDK stack:
// import { ResourceNames } from './resource-names';
// const names = new ResourceNames(this.node.tryGetContext('environment') || 'dev');
// new lambda.Function(this, 'MyLambda', {
//   functionName: names.e2eTestStack.lambdaFunction,
//   // ...
// });
```

This approach ensures that all resource names are derived from a single source of truth, making them consistent, predictable, and easy to manage. Any changes to the naming convention can be made in one place and will automatically apply across the entire codebase.
