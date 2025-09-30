#!/usr/bin/env bash
.PHONY: help
help: ## Display this help screen
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*?## "}; /^[a-zA-Z_-]+:.*?## / {printf "  \033[32m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ==============================================================================
# Application Tasks
# ==============================================================================

.PHONY: test
test: check-auth ## Run e2e tests locally
	@op run -- npm exec playwright -- test e2e/ --reporter=list

check-auth: ## Abort if not signed in to 1Password CLI
	@echo "Checking 1Password CLI authentication..."
	@if ! op whoami > /dev/null 2>&1; then \
		echo "\033[31mError: Not signed in to 1Password. Please run 'op signin' in your terminal.\033[0m"; \
		exit 1; \
	fi

.PHONY: signin
signin: ## Interactive: Sign in to 1Password CLI
	@echo "Please follow the prompts to sign in to 1Password CLI..."
	@eval $$(op signin)

.PHONY: whoami ## Check 1Password CLI sign-in status
	@echo "Checking 1Password CLI sign-in status..."
	@op whoami


