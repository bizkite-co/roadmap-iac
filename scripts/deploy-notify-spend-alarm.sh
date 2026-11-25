#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$REPO_ROOT/cdk.out-notify-spend"
STACK_NAME="RoadmapNotifySpendAlarmStack"

cd "$REPO_ROOT"
npx cdk --app "npx ts-node bin/notify-spend-alarm.ts" synth "$STACK_NAME" --output "$OUT_DIR"

# This alarm stack has no assets. Remove CDK's bootstrap parameter and metadata
# resource so CloudFormation can deploy it in accounts that are not CDK-bootstrapped.
python3 - "$OUT_DIR/$STACK_NAME.template.json" "$OUT_DIR/$STACK_NAME.cloudformation.json" <<'PY'
import json
import sys

source, destination = sys.argv[1:]
with open(source, encoding="utf-8") as stream:
    template = json.load(stream)
template.get("Parameters", {}).pop("BootstrapVersion", None)
template.pop("Rules", None)
template.get("Resources", {}).pop("CDKMetadata", None)
with open(destination, "w", encoding="utf-8") as stream:
    json.dump(template, stream, indent=2)
    stream.write("\n")
PY

aws cloudformation deploy \
  --template-file "$OUT_DIR/$STACK_NAME.cloudformation.json" \
  --stack-name "$STACK_NAME" \
  --region "${AWS_REGION:-us-west-1}" \
  --profile "${AWS_PROFILE:-westmonroe-support}" \
  --no-fail-on-empty-changeset
