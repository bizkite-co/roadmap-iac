#!/bin/bash

echo "Please sign in to 1Password. You will be prompted for your password."
eval $(op signin)

if [ $? -ne 0 ]; then
    echo "1Password sign-in failed. Exiting."
    exit 1
fi

echo "Running Playwright E2E tests with 1Password integration..."
op run -- npm exec playwright test e2e/