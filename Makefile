#!/usr/bin/env bash
.PHONY: help
help: ## Display this help screen
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*?## "}; /^[a-zA-Z_-]+:.*?## / {printf "  \033[32m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ==============================================================================
# Application Tasks
# ==============================================================================

.PHONY: deploy
deploy: ## Deploy the E2E test stack to AWS
	cdk deploy RoadmapE2ETestStack

.PHONY: update-e2e-secret
update-e2e-secret: ## Create or update the E2E test secret in AWS Secrets Manager using 1Password
	./scripts/update-e2e-secret.sh
