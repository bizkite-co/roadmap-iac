AWS_PROFILE ?= westmonroe-support
AWS_REGION ?= us-west-1
ANSIBLE_VERSION := 2.21.5
TOMCAT_SESSION_INVENTORY := dev-ops/ansible/inventory
TOMCAT_SESSION_PLAYBOOK := dev-ops/ansible/roadmap-session-timeout.yml

.PHONY: tomcat-session-timeout-prepare tomcat-session-timeout-verify
tomcat-session-timeout-prepare: ## Apply Roadmap's 30-minute Tomcat idle session policy (ENV=uat|prod)
	@test "$(ENV)" = "uat" -o "$(ENV)" = "prod" || { echo "Set ENV=uat or ENV=prod" >&2; exit 2; }
	@test "$(ENV)" != "prod" -o "$(CONFIRM_PROD)" = "1" || { echo "Set CONFIRM_PROD=1 to change PROD Tomcat." >&2; exit 2; }
	@limit=UAT; test "$(ENV)" != "prod" || limit=PROD; \
	AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=$(AWS_REGION) uv tool run --from ansible-core==$(ANSIBLE_VERSION) \
	  ansible-playbook -i $(TOMCAT_SESSION_INVENTORY) $(TOMCAT_SESSION_PLAYBOOK) \
	  --limit "$$limit" -e "roadmap_environment=$(ENV)" -e roadmap_session_timeout_mode=prepare

tomcat-session-timeout-verify: ## Verify Roadmap's 30-minute Tomcat idle session policy (ENV=uat|prod)
	@test "$(ENV)" = "uat" -o "$(ENV)" = "prod" || { echo "Set ENV=uat or ENV=prod" >&2; exit 2; }
	@limit=UAT; test "$(ENV)" != "prod" || limit=PROD; \
	AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=$(AWS_REGION) uv tool run --from ansible-core==$(ANSIBLE_VERSION) \
	  ansible-playbook -i $(TOMCAT_SESSION_INVENTORY) $(TOMCAT_SESSION_PLAYBOOK) \
	  --limit "$$limit" -e "roadmap_environment=$(ENV)" -e roadmap_session_timeout_mode=verify
