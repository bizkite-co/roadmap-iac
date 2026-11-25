#!/usr/bin/env bash
# Create or delete the ephemeral login used by the E2E tests.
# E2E_ENV=prod (or TARGET_ENV=prod) uses PRS-PROD. Anything else uses PRS-UAT.
# The password is generated here and written to E2E_USER_ENV_FILE. It is not stored
# in Secrets Manager. Keep this file in sync with roadmap-iac/scripts/provision-e2e-user.sh.
set -euo pipefail

EMAIL="test@bizkite.net"
ACTION="${1:-}"
ENV_FILE="${E2E_USER_ENV_FILE:-}"

if [ "$ACTION" != "create" ] && [ "$ACTION" != "delete" ]; then
  echo "usage: $0 create|delete" >&2
  exit 2
fi

e2e_target() {
  printf '%s' "${E2E_ENV:-${TARGET_ENV:-uat}}"
}

default_ssh_host() {
  if [ "$(e2e_target)" = "prod" ]; then
    printf '%s' "${prod:-ubuntu@184.72.30.45}"
  else
    printf '%s' "${uat:-ubuntu@54.177.161.104}"
  fi
}

default_instance_tag() {
  if [ "$(e2e_target)" = "prod" ]; then
    printf '%s' "PRS-PROD"
  else
    printf '%s' "PRS-UAT"
  fi
}

run_sql() {
  local sql="$1"
  if [ "${E2E_DB_VIA:-}" = "ssm" ] || { [ "${CI:-}" = "true" ] && [ -z "${E2E_DB_SSH:-}" ]; }; then
    run_sql_ssm "$sql"
  else
    run_sql_ssh "$sql"
  fi
}

run_sql_ssh() {
  local sql="$1"
  local host="${E2E_DB_SSH:-$(default_ssh_host)}"
  printf '%s\n' "$sql" | ssh -o BatchMode=yes -o ConnectTimeout=20 "$host" \
    'sudo mysql --defaults-file=/etc/mysql/debian.cnf -N -B prs_dev'
}

run_sql_ssm() {
  local sql="$1"
  local instance_id="${E2E_DB_INSTANCE_ID:-}"
  local instance_tag="${E2E_DB_INSTANCE_TAG:-$(default_instance_tag)}"
  local b64 params cmd_id status stderr_text
  if [ -z "$instance_id" ]; then
    instance_id=$(aws ec2 describe-instances \
      --filters Name=tag:Name,Values="${instance_tag}" Name=instance-state-name,Values=running \
      --query 'Reservations[0].Instances[0].InstanceId' --output text)
  fi
  if [ -z "$instance_id" ] || [ "$instance_id" = "None" ]; then
    echo "No running EC2 instance tagged ${instance_tag}" >&2
    exit 1
  fi
  b64=$(printf '%s' "$sql" | base64 -w0)
  params=$(mktemp)
  CMD_B64="$b64" PARAMS="$params" python3 - <<'PY'
import json, os
b64 = os.environ["CMD_B64"]
remote = "printf '%s' '" + b64 + "' | base64 -d | sudo mysql --defaults-file=/etc/mysql/debian.cnf -N -B prs_dev"
with open(os.environ["PARAMS"], "w") as fh:
    json.dump({"commands": [remote]}, fh)
PY
  cmd_id=$(aws ssm send-command \
    --instance-ids "$instance_id" \
    --document-name AWS-RunShellScript \
    --comment "e2e user ${ACTION}" \
    --parameters "file://${params}" \
    --query 'Command.CommandId' --output text)
  rm -f "$params"
  status="Pending"
  for _ in $(seq 1 40); do
    status=$(aws ssm get-command-invocation --command-id "$cmd_id" --instance-id "$instance_id" --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in
      Success|Failed|Cancelled|TimedOut) break ;;
    esac
    sleep 2
  done
  if [ "$status" != "Success" ]; then
    stderr_text=$(aws ssm get-command-invocation --command-id "$cmd_id" --instance-id "$instance_id" --query StandardErrorContent --output text 2>/dev/null || true)
    printf '%s\n' "$stderr_text" | sed -E 's/[0-9a-f]{64}/[redacted]/g' >&2
    echo "SSM mysql command ${status}" >&2
    exit 1
  fi
  aws ssm get-command-invocation --command-id "$cmd_id" --instance-id "$instance_id" --query StandardOutputContent --output text
}

delete_body() {
  cat <<'SQL'
SET @email := 'test@bizkite.net';
SET @id := (SELECT User_ID FROM users WHERE Username = @email LIMIT 1);
DELETE cc FROM CollegeCalculator cc INNER JOIN client c ON c.id = cc.client_id WHERE @id IS NOT NULL AND (c.user_id = @id OR c.updated_by = @id);
DELETE wc FROM WidowCalculator wc INNER JOIN client c ON c.id = wc.client_id WHERE @id IS NOT NULL AND (c.user_id = @id OR c.updated_by = @id);
DELETE ai FROM asset_item ai INNER JOIN client c ON c.id = ai.client_id WHERE @id IS NOT NULL AND (c.user_id = @id OR c.updated_by = @id);
DELETE pi FROM passive_income_item pi INNER JOIN client c ON c.id = pi.client_id WHERE @id IS NOT NULL AND (c.user_id = @id OR c.updated_by = @id);
DELETE r FROM roadmap r INNER JOIN client c ON c.id = r.client_id WHERE @id IS NOT NULL AND (c.user_id = @id OR c.updated_by = @id);
DELETE p FROM pdf p WHERE @id IS NOT NULL AND (p.user_id = @id OR p.client_id IN (SELECT id FROM client WHERE user_id = @id OR updated_by = @id));
DELETE FROM client WHERE @id IS NOT NULL AND (user_id = @id OR updated_by = @id);
DELETE FROM METRICS WHERE @id IS NOT NULL AND user_id = @id;
DELETE FROM user_login_info WHERE @id IS NOT NULL AND user_id = @id;
DELETE FROM user_roles WHERE @id IS NOT NULL AND userId = @id;
UPDATE users SET Reports_to = NULL WHERE @id IS NOT NULL AND Reports_to = @id;
DELETE FROM users WHERE @id IS NOT NULL AND User_ID = @id;
SQL
}

delete_sql() {
  delete_body
  printf "%s\n" "SELECT CASE WHEN COUNT(*) = 0 THEN 'USER_GONE' ELSE 'USER_STILL_PRESENT' END FROM users WHERE Username = @email;"
}

create_user() {
  local password hash sql output
  # The login form rejects more than 20 characters (maxlength="20").
  # A longer value is truncated by the browser, so the submitted password
  # would not match the hash stored here.
  password=$(python3 -c 'import secrets; print(secrets.token_hex(10))')
  hash=$(printf '%s' "$password" | python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')
  if ! printf '%s' "$hash" | grep -Eq '^[0-9a-f]{64}$'; then
    echo "Password hash was not 64 hex characters" >&2
    exit 1
  fi
  sql="$(delete_body)
INSERT INTO users (
  Username, Password, First_Name, Last_Name, Email, Email_Code,
  Registration, Reg_DateTime, Code_Used, Active, Password_Reset, AcceptTCs,
  Associated_Company, Account_Type, trial_account, Trial_End,
  prs_plan, tax_trap_only, Login_Count, fullName,
  Address, City, State, Phone, Institution_Name, broker_dealer, Title, Fax, addressFormatted, discount_code
) VALUES (
  '${EMAIL}', '${hash}', 'Test', 'User', '${EMAIL}', '',
  CURDATE(), NOW(), '', 1, 0, 1,
  'None', 'Producer', 0, NULL,
  1, 0, 0, 'Test User',
  '', '', '', '', '', '', '', '', '', ''
);
INSERT INTO user_roles (role, userId)
SELECT 'Producer', User_ID FROM users WHERE Username = '${EMAIL}';
SELECT CASE
  WHEN COUNT(*) = 1 AND SUM(u.Active = 1 AND CHAR_LENGTH(u.Password) = 64 AND CHAR_LENGTH(u.Email_Code) = 0 AND u.trial_account = 0 AND u.Trial_End IS NULL AND u.Password_Reset = 0) = 1
  THEN 'USER_READY' ELSE 'USER_NOT_READY' END
FROM users u
JOIN user_roles r ON r.userId = u.User_ID AND r.role = 'Producer'
WHERE u.Username = '${EMAIL}';
"
  output=$(run_sql "$sql")
  if ! printf '%s' "$output" | grep -q 'USER_READY'; then
    printf '%s\n' "$output" | sed -E 's/[0-9a-f]{64}/[redacted]/g' >&2
    echo "E2E user was not created" >&2
    exit 1
  fi
  if [ -z "$ENV_FILE" ]; then
    echo "E2E_USER_ENV_FILE is required for create" >&2
    exit 1
  fi
  umask 077
  {
    printf 'E2E_USER_EMAIL=%s\n' "$EMAIL"
    printf 'E2E_USER_USERNAME=%s\n' "$EMAIL"
    printf 'E2E_USER_PASSWORD=%s\n' "$password"
    printf 'E2E_USER_CREATED=1\n'
  } > "$ENV_FILE"
  echo "Created ephemeral E2E user ${EMAIL}"
}

delete_user() {
  local output
  output=$(run_sql "$(delete_sql)")
  if ! printf '%s' "$output" | grep -q 'USER_GONE'; then
    printf '%s\n' "$output" >&2
    echo "E2E user was not removed" >&2
    exit 1
  fi
  if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
    rm -f "$ENV_FILE"
  fi
  echo "Removed ephemeral E2E user ${EMAIL}"
}

case "$ACTION" in
  create) create_user ;;
  delete) delete_user ;;
esac
