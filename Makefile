#!/usr/bin/env bash
.PHONY: help
help: ## Display this help screen
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*?## "}; /^[a-zA-Z_-]+:.*?## / {printf "  \033[32m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ==============================================================================
# Application Tasks
# ==============================================================================

.PHONY: install
install: ## Run NPM install
	@npm install

install-lambda: ## Install lambda pacakages
	@npm install --prefix lambda

.PHONY: synth
synth: ## cdk synth
	@cdk synth

.PHONY: deploy
deploy: synth ## Deploy the E2E test stack to AWS
	cdk deploy RoadmapE2ETestStack

.PHONY: deploy-uat-cloudfront
deploy-uat-cloudfront: ## Deploy the UAT CloudFront ACM front door stack
	npx cdk deploy -a 'npx ts-node bin/uat-cloudfront.ts' RoadmapUatCloudFrontStack

.PHONY: update-e2e-secret
update-e2e-secret: ## Create or update the E2E test secret in AWS Secrets Manager using 1Password
	./scripts/update-e2e-secret.sh

.PHONY: get-e2e-results
get-e2e-results: ## Get the last 3 E2E test results
	@./scripts/get-e2e-results.sh

.PHONY: get-e2e-logs
get-e2e-logs: ## Get the logs for the E2E test runner lambda
	@./scripts/get-e2e-logs.sh

.PHONY: run-schedule
run-schedule: ## Update the E2E test schedule to run in 30 seconds
	@./scripts/run-schedule.sh

.PHONY: list-schedules
list-schedules: ## List the E2E test schedules
	@./scripts/list-schedules.sh

.PHONY: list-runs
list-runs: ## List the last 10 runs of the E2E test lambda
	@LOG_GROUP_NAME="/roadmap/prod/roadmap-e2e-test-runner-log-group"; \
	echo "Fetching recent runs from log group $${LOG_GROUP_NAME}..."; \
	aws logs filter-log-events --log-group-name $${LOG_GROUP_NAME} --filter-pattern "START RequestId" --limit 10 --query 'events[].{Timestamp:timestamp, Message:message}' --output table
.PHONY: notify-spend-alarm-synth notify-spend-alarm-deploy
notify-spend-alarm-synth: ## Synthesize the PROD Notify spend alarm stack without AWS changes
	npx cdk --app "npx ts-node bin/notify-spend-alarm.ts" synth RoadmapNotifySpendAlarmStack --output cdk.out-notify-spend

notify-spend-alarm-deploy: ## Deploy the $12 Notify spend alarm through CloudFormation
	./scripts/deploy-notify-spend-alarm.sh
