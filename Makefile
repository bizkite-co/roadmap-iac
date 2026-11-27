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

.PHONY: test
test: ## Syntax-check shell embedded in the CDK buildspecs
	npm test

.PHONY: lint
lint: ## Flag JavaScript string escapes that do not survive into bash
	npm run lint

.PHONY: synth
synth: ## cdk synth
	@cdk synth

.PHONY: deploy
deploy: test lint synth ## Deploy the E2E test stack to AWS
	cdk deploy RoadmapE2ETestStack

.PHONY: deploy-uat-cloudfront
deploy-uat-cloudfront: ## Deploy the UAT CloudFront ACM front door stack
	AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=us-west-1 npx cdk deploy -a 'npx ts-node bin/uat-cloudfront.ts' RoadmapUatCloudFrontStack --require-approval never --parameters BootstrapVersion=/cdk-bootstrap/hbt/version --previous-parameters false
	AWS_PROFILE=$(AWS_PROFILE) ./scripts/restrict-uat-origin-ingress.sh

.PHONY: deploy-uat-alb-routing
deploy-uat-alb-routing: ## Route UAT through the shared ALB using a UAT-only host rule
	AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=us-west-1 npx cdk deploy -a 'npx ts-node bin/uat-alb-routing.ts' RoadmapUatAlbRoutingStack --require-approval never

.PHONY: deploy-prod-cloudfront
deploy-prod-cloudfront: ## Deploy the PROD CloudFront ACM front door stack
	npx cdk deploy -a 'npx ts-node bin/prod-cloudfront.ts' RoadmapProdCloudFrontStack

.PHONY: deploy-prod-host-refresh
deploy-prod-host-refresh: ## Deploy the Saturday PRS-PROD stop and start schedules
	npx cdk deploy -a 'npx ts-node bin/prod-host-refresh.ts' RoadmapProdHostRefreshStack

.PHONY: update-e2e-secret
update-e2e-secret: ## Retired. The E2E user password is generated for each run and is not stored.
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
.PHONY: deploy-ses-mail
deploy-ses-mail: ## Deploy the SES API permission and recorded sender settings
	./node_modules/.bin/tsc --target ES2020 --module commonjs --esModuleInterop --skipLibCheck --outDir /tmp/roadmap-iac-ses-build lib/ses-outbound-mail-stack.ts bin/ses-outbound-mail.ts
	NODE_PATH=$(CURDIR)/node_modules cdk deploy -a 'NODE_PATH=$(CURDIR)/node_modules node /tmp/roadmap-iac-ses-build/bin/ses-outbound-mail.js' RoadmapSesOutboundMailStack --require-approval never

SECURITY_CAMPAIGN_BUILD := $(CURDIR)/.cdk.staging/security-campaign-build
SECURITY_CAMPAIGN_APP := NODE_PATH=$(CURDIR)/node_modules node $(SECURITY_CAMPAIGN_BUILD)/bin/security-campaign.js
.PHONY: security-campaign-build security-campaign-synth security-campaign-deploy security-campaign-start security-campaign-status security-campaign-stop
security-campaign-build: ## Compile the one-time security campaign infrastructure app
	./node_modules/.bin/tsc --target ES2020 --module commonjs --esModuleInterop --skipLibCheck --outDir $(SECURITY_CAMPAIGN_BUILD) lib/security-campaign-stack.ts bin/security-campaign.ts

security-campaign-synth: security-campaign-build ## Synthesize the durable email campaign infrastructure
	AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=us-west-1 cdk synth -a '$(SECURITY_CAMPAIGN_APP)' RoadmapSecurityCampaignStack --output .cdk.staging/security-campaign-cdk.out

security-campaign-deploy: security-campaign-build ## Deploy the durable email campaign infrastructure
	AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=us-west-1 cdk deploy -a '$(SECURITY_CAMPAIGN_APP)' RoadmapSecurityCampaignStack --require-approval never

security-campaign-start: ## Start the paced 24-hour campaign (usage: CAMPAIGN_ID=... RECIPIENT_COUNT=... CONFIRM_SEND=1 make security-campaign-start)
	@test "$(CONFIRM_SEND)" = "1" -a -n "$(CAMPAIGN_ID)" -a -n "$(RECIPIENT_COUNT)" || (echo "Set CAMPAIGN_ID, RECIPIENT_COUNT, and CONFIRM_SEND=1" && exit 1)
	@set -e; \
	STATE_MACHINE_ARN=$$(aws cloudformation describe-stacks --profile $(AWS_PROFILE) --region us-west-1 --stack-name RoadmapSecurityCampaignStack --query "Stacks[0].Outputs[?OutputKey=='CampaignStateMachineArn'].OutputValue | [0]" --output text); \
	INPUT=$$(printf '{"campaignId":"%s","index":0,"total":%s,"delaySeconds":156}' "$(CAMPAIGN_ID)" "$(RECIPIENT_COUNT)"); \
	aws stepfunctions start-execution --profile $(AWS_PROFILE) --region us-west-1 --state-machine-arn "$$STATE_MACHINE_ARN" --name "$(CAMPAIGN_ID)" --input "$$INPUT"

security-campaign-status: ## Describe the current campaign execution (usage: EXECUTION_ARN=... make security-campaign-status)
	@test -n "$(EXECUTION_ARN)" || (echo "Set EXECUTION_ARN=<Step Functions execution ARN>" && exit 1)
	aws stepfunctions describe-execution --profile $(AWS_PROFILE) --region us-west-1 --execution-arn "$(EXECUTION_ARN)" --query '{status:status,startDate:startDate,stopDate:stopDate,error:error,cause:cause}' --output table

security-campaign-stop: ## Stop the current campaign execution (usage: EXECUTION_ARN=... make security-campaign-stop)
	@test -n "$(EXECUTION_ARN)" || (echo "Set EXECUTION_ARN=<Step Functions execution ARN>" && exit 1)
	aws stepfunctions stop-execution --profile $(AWS_PROFILE) --region us-west-1 --execution-arn "$(EXECUTION_ARN)" --error OperatorStopped --cause "Stopped by campaign operator"

# Spring modernization host targets (isolated from the default E2E CDK app)
SPRING_UPGRADE_STACK := RoadmapSpringModernizationHostStack
SPRING_UPGRADE_BUILD := /tmp/roadmap-iac-spring-upgrade-build
SPRING_UPGRADE_APP := NODE_PATH=$(CURDIR)/node_modules node $(SPRING_UPGRADE_BUILD)/bin/spring-modernization-host.js
AWS_PROFILE ?= westmonroe-support
AWS_REGION ?= us-west-1
SPRING_UPGRADE_SUPPRESS_EMAIL_SEND ?= true
SPRING_UPGRADE_REQUIRE_APPROVAL ?= broadening
SPRING_UPGRADE_ANSIBLE_ENV := /tmp/roadmap-iac-ansible-venv
SPRING_UPGRADE_ANSIBLE_CACHE := /tmp/roadmap-iac-ansible-cache
SPRING_UPGRADE_ANSIBLE_COLLECTIONS := /tmp/roadmap-iac-ansible-collections
SPRING_UPGRADE_ANSIBLE_LOCAL_TEMP := /tmp/roadmap-iac-ansible-local-temp

.PHONY: spring-upgrade-build spring-upgrade-synth spring-upgrade-deploy spring-upgrade-ansible-install spring-upgrade-configure spring-upgrade-destroy
spring-upgrade-build: ## Compile the isolated Spring modernization CDK app into /tmp
	./node_modules/.bin/tsc --target ES2020 --module commonjs --esModuleInterop --skipLibCheck --outDir $(SPRING_UPGRADE_BUILD) lib/spring-modernization-host-stack.ts bin/spring-modernization-host.ts

spring-upgrade-synth: spring-upgrade-build ## Synthesize the isolated Spring modernization host (reads the UAT account's default VPC)
	AWS_REGION=$(AWS_REGION) cdk synth -a '$(SPRING_UPGRADE_APP)' $(SPRING_UPGRADE_STACK) --output /tmp/roadmap-iac-spring-upgrade-cdk.out

spring-upgrade-deploy: spring-upgrade-synth ## Create the isolated Spring modernization host (starts recurring AWS charges)
	AWS_REGION=$(AWS_REGION) ./scripts/deploy-spring-upgrade-host.sh /tmp/roadmap-iac-spring-upgrade-cdk.out/$(SPRING_UPGRADE_STACK).template.json

spring-upgrade-ansible-install: ## Install the locked Ansible controller environment and AWS collection
	UV_CACHE_DIR=$(SPRING_UPGRADE_ANSIBLE_CACHE) UV_PROJECT_ENVIRONMENT=$(SPRING_UPGRADE_ANSIBLE_ENV) uv sync --project dev-ops/ansible --locked
	UV_CACHE_DIR=$(SPRING_UPGRADE_ANSIBLE_CACHE) UV_PROJECT_ENVIRONMENT=$(SPRING_UPGRADE_ANSIBLE_ENV) ANSIBLE_COLLECTIONS_PATH=$(SPRING_UPGRADE_ANSIBLE_COLLECTIONS) uv run --project dev-ops/ansible --locked ansible-galaxy collection install -p $(SPRING_UPGRADE_ANSIBLE_COLLECTIONS) -r dev-ops/ansible/spring-upgrade-requirements.yml

spring-upgrade-configure: spring-upgrade-ansible-install ## Apply the idempotent Ansible baseline over SSM to PRS-SPRING-UPGRADE
	@command -v session-manager-plugin >/dev/null || { echo "Install the AWS Session Manager plugin before configuring the host." >&2; exit 1; }
	@bucket=$$(AWS_REGION=$(AWS_REGION) aws cloudformation describe-stacks --stack-name $(SPRING_UPGRADE_STACK) --query "Stacks[0].Outputs[?OutputKey=='AnsibleTransferBucketName'].OutputValue | [0]" --output text); \
	  test -n "$$bucket" -a "$$bucket" != "None" || { echo 'Deploy the host stack first.' >&2; exit 1; }; \
	  inventory=$$(UV_CACHE_DIR=$(SPRING_UPGRADE_ANSIBLE_CACHE) UV_PROJECT_ENVIRONMENT=$(SPRING_UPGRADE_ANSIBLE_ENV) ANSIBLE_COLLECTIONS_PATH=$(SPRING_UPGRADE_ANSIBLE_COLLECTIONS) AWS_DEFAULT_REGION=$(AWS_REGION) uv run --project dev-ops/ansible --locked ansible-inventory -i dev-ops/ansible/spring-upgrade.aws_ec2.yml --list) || exit; \
	  printf '%s' "$$inventory" | python3 -c 'import json,sys; data=json.load(sys.stdin); hosts=data.get("aws_ec2",{}).get("hosts",[]); sys.exit(0 if hosts else 1)' || { echo 'No running PRS-SPRING-UPGRADE instance is present in the AWS inventory.' >&2; exit 1; }; \
	  UV_CACHE_DIR=$(SPRING_UPGRADE_ANSIBLE_CACHE) UV_PROJECT_ENVIRONMENT=$(SPRING_UPGRADE_ANSIBLE_ENV) ANSIBLE_COLLECTIONS_PATH=$(SPRING_UPGRADE_ANSIBLE_COLLECTIONS) ANSIBLE_LOCAL_TEMP=$(SPRING_UPGRADE_ANSIBLE_LOCAL_TEMP) AWS_DEFAULT_REGION=$(AWS_REGION) ANSIBLE_INVENTORY_UNPARSED_IS_FAILED=true uv run --project dev-ops/ansible --locked ansible-playbook -i dev-ops/ansible/spring-upgrade.aws_ec2.yml dev-ops/ansible/spring-upgrade-playbook.yml -e "ansible_aws_ssm_bucket_name=$$bucket" -e "suppress_email_send=$(SPRING_UPGRADE_SUPPRESS_EMAIL_SEND)"

spring-upgrade-destroy: spring-upgrade-build ## Destroy the isolated host stack and its temporary Ansible transfer bucket
	AWS_REGION=$(AWS_REGION) cdk destroy -a '$(SPRING_UPGRADE_APP)' $(SPRING_UPGRADE_STACK)

.PHONY: notify-spend-alarm-synth notify-spend-alarm-deploy
notify-spend-alarm-synth: ## Synthesize the PROD Notify spend alarm stack without AWS changes
	./scripts/deploy-notify-spend-alarm.sh --synth-only

notify-spend-alarm-deploy: ## Deploy the 60% Notify spend alarm after calculating from the enforced cap
	./scripts/deploy-notify-spend-alarm.sh
