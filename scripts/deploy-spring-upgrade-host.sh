#!/usr/bin/env bash
set -euo pipefail

TEMPLATE="${1:-}"
if [[ -z "$TEMPLATE" || ! -f "$TEMPLATE" ]]; then
  echo "Usage: AWS_PROFILE=westmonroe-support AWS_REGION=us-west-1 $0 <synthesized-template.json>" >&2
  exit 2
fi

AWS_REGION="${AWS_REGION:-us-west-1}"
EXPECTED_ACCOUNT="${AWS_ACCOUNT_ID:-}"
STACK_NAME="RoadmapSpringModernizationHostStack"
if [[ -z "$EXPECTED_ACCOUNT" ]]; then
  echo "AWS_ACCOUNT_ID must be set; source the isolated UAT credentials first." >&2
  exit 2
fi

CALLER_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$CALLER_ACCOUNT" != "$EXPECTED_ACCOUNT" ]]; then
  echo "Refusing to deploy: profile account $CALLER_ACCOUNT is not $EXPECTED_ACCOUNT." >&2
  exit 1
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
python3 - "$TEMPLATE" "$TEMP_DIR/template.json" <<'PY'
import json
import sys

source, destination = sys.argv[1:]
with open(source, encoding="utf-8") as stream:
    template = json.load(stream)

# This stack has no CDK assets. Remove the unused bootstrap checks so the
# existing CloudFormation-only account deployment pattern can deploy it.
template.get("Parameters", {}).pop("BootstrapVersion", None)
template.pop("Rules", None)
template.get("Resources", {}).pop("CDKMetadata", None)

with open(destination, "w", encoding="utf-8") as stream:
    json.dump(template, stream, indent=2)
    stream.write("\n")
PY

aws cloudformation validate-template \
  --region "$AWS_REGION" \
  --template-body "file://$TEMP_DIR/template.json" >/dev/null

aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMP_DIR/template.json" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].{Status:StackStatus,Instance:Outputs[?OutputKey==`HostInstanceId`].OutputValue|[0]}' \
  --output table
