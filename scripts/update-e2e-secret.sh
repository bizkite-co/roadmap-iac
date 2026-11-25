#!/bin/bash
echo "The E2E password is generated at the start of each test run and the user is removed at the end." >&2
echo "It is not stored in Secrets Manager. This command no longer writes roadmap-e2e-credentials." >&2
exit 1
