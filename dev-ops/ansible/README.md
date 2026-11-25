# Ansible Use Cases


## Install CloudWatch Agent

```sh
ansible-playbook dev-ops/ansible/cloudwatch_agent_playbook.yml --limit $uat
```

## Manage Roadmap Apache route allowlists

The application route allowlists in the UAT and PROD Apache vhosts are managed
by `roadmap-apache-routes.yml` and `normalize-apache-routes.py`. The playbook
targets exactly one host from the checked-in `UAT` or `PROD` inventory group.
It reads and validates both vhost files before writing, handles repeated legacy
route conditions, creates timestamped backups, runs `apache2ctl configtest`,
reloads Apache only when files change, and rolls back on validation failure.

Use UAT first:

```sh
make -f dev-ops/ansible/apache-routes.mk apache-routes-prepare ENV=uat
make -f dev-ops/ansible/apache-routes.mk apache-routes-verify ENV=uat
```

For PROD, the prepare target requires `CONFIRM_PROD=1`; verify is read-only:

```sh
make -f dev-ops/ansible/apache-routes.mk apache-routes-verify ENV=prod
make -f dev-ops/ansible/apache-routes.mk apache-routes-prepare ENV=prod CONFIRM_PROD=1
```

The website repository's `make deploy-uat` and `make deploy-prod` now apply this
policy before deploying the WAR, so new controller routes cannot be deployed
without reconciling Apache first. Set `ROADMAP_IAC_DIR` if the repositories are
not sibling directories.
