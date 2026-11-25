#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"
CONFIG_ID="${2:-}"
if [[ ! "$CONFIG_ID" =~ ^notify-[a-f0-9]+$ ]]; then
  echo "Usage: AWS_PROFILE=westmonroe-support $0 uat|prod notify-<configuration-id>" >&2
  exit 2
fi
case "$ENVIRONMENT" in
  uat)
    STACK_NAME="RoadmapUatAwsSmsMfaStack"
    ROLE_NAME="RoadmapUatInstanceRole"
    ;;
  prod)
    STACK_NAME="RoadmapProdAwsSmsMfaStack"
    ROLE_NAME="RoadmapProdInstanceRole"
    ;;
  *)
    echo "Usage: AWS_PROFILE=westmonroe-support $0 uat|prod notify-<configuration-id>" >&2
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AWS_PROFILE="${AWS_PROFILE:-westmonroe-support}"
AWS_REGION="us-west-1"
EXPECTED_ACCOUNT="865664998993"

CALLER_ACCOUNT="$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)"
if [[ "$CALLER_ACCOUNT" != "$EXPECTED_ACCOUNT" ]]; then
  echo "Refusing to deploy: profile account $CALLER_ACCOUNT is not $EXPECTED_ACCOUNT." >&2
  exit 1
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
cd "$REPO_ROOT"
npx cdk --app "npx ts-node bin/aws-sms-mfa.ts" synth "$STACK_NAME" --output "$TEMP_DIR/cdk.out"

# This stack contains no assets. Remove CDK's unused bootstrap-version SSM
# parameter so CloudFormation can deploy it without bootstrapping the account.
python3 - "$TEMP_DIR/cdk.out/${STACK_NAME}.template.json" "$TEMP_DIR/template.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    template = json.load(source)
template.get("Parameters", {}).pop("BootstrapVersion", None)
template.pop("Rules", None)
with open(sys.argv[2], "w", encoding="utf-8") as destination:
    json.dump(template, destination, indent=2)
    destination.write("\n")
PY

aws cloudformation deploy \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMP_DIR/template.json" \
  --parameter-overrides "NotifyConfigurationId=$CONFIG_ID" \
  --capabilities CAPABILITY_IAM

aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].{Status:StackStatus,Role:Outputs[?OutputKey==`ApplicationRoleName`].OutputValue|[0],NotifyArn:Outputs[?OutputKey==`NotifyConfigurationArn`].OutputValue|[0]}' \
  --output table
