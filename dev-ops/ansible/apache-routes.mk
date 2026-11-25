AWS_PROFILE ?= westmonroe-support
AWS_REGION ?= us-west-1
ANSIBLE_VERSION := 2.21.5
APACHE_ROUTES_INVENTORY := dev-ops/ansible/inventory
APACHE_ROUTES_PLAYBOOK := dev-ops/ansible/roadmap-apache-routes.yml

.PHONY: apache-routes-prepare apache-routes-verify
apache-routes-prepare: ## Apply the versioned Roadmap Apache route policy (ENV=uat|prod)
	@test "$(ENV)" = "uat" -o "$(ENV)" = "prod" || { echo "Set ENV=uat or ENV=prod" >&2; exit 2; }
	@test "$(ENV)" != "prod" -o "$(CONFIRM_PROD)" = "1" || { echo "Set CONFIRM_PROD=1 to change PROD Apache." >&2; exit 2; }
	@limit=UAT; test "$(ENV)" != "prod" || limit=PROD; \
	AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=$(AWS_REGION) uv tool run --from ansible-core==$(ANSIBLE_VERSION) \
	  ansible-playbook -i $(APACHE_ROUTES_INVENTORY) $(APACHE_ROUTES_PLAYBOOK) \
	  --limit "$$limit" -e "roadmap_environment=$(ENV)" -e roadmap_apache_mode=prepare

apache-routes-verify: ## Verify the versioned Roadmap Apache route policy (ENV=uat|prod)
	@test "$(ENV)" = "uat" -o "$(ENV)" = "prod" || { echo "Set ENV=uat or ENV=prod" >&2; exit 2; }
	@limit=UAT; test "$(ENV)" != "prod" || limit=PROD; \
	AWS_PROFILE=$(AWS_PROFILE) AWS_REGION=$(AWS_REGION) uv tool run --from ansible-core==$(ANSIBLE_VERSION) \
	  ansible-playbook -i $(APACHE_ROUTES_INVENTORY) $(APACHE_ROUTES_PLAYBOOK) \
	  --limit "$$limit" -e "roadmap_environment=$(ENV)" -e roadmap_apache_mode=verify
