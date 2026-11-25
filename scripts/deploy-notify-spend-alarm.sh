#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$REPO_ROOT/cdk.out-notify-spend"
STACK_NAME="RoadmapNotifySpendAlarmStack"
SYNTH_ONLY=0
if [[ "${1:-}" == "--synth-only" ]]; then
  SYNTH_ONLY=1
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--synth-only]" >&2
  exit 2
fi

cd "$REPO_ROOT"

# Read the enforced cap on demand. Re-run this helper after changing that cap;
# no recurring process is needed to keep the alarm threshold current.
SPEND_LIMITS="$(aws pinpoint-sms-voice-v2 describe-spend-limits \
  --region "${AWS_REGION:-us-west-1}" \
  --profile "${AWS_PROFILE:-westmonroe-support}" \
  --output json)"
NOTIFY_CAP="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(next((x["EnforcedLimit"] for x in d["SpendLimits"] if x["Name"] == "NOTIFY_MESSAGE_MONTHLY_SPEND_LIMIT"), ""))' "$SPEND_LIMITS")"
THRESHOLD="$(python3 -c 'from decimal import Decimal; import sys; cap=Decimal(sys.argv[1]); print((cap * Decimal("0.60")).quantize(Decimal("0.01")))' "$NOTIFY_CAP")"
echo "Using current enforced Notify cap of \$$NOTIFY_CAP; alarm threshold is 60%: \$$THRESHOLD."

npx cdk --app "npx ts-node bin/notify-spend-alarm.ts" \
  -c "notifySpendThreshold=$THRESHOLD" \
  synth "$STACK_NAME" --output "$OUT_DIR"

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

if [[ "$SYNTH_ONLY" == 1 ]]; then
  exit 0
fi

aws cloudformation deploy \
  --template-file "$OUT_DIR/$STACK_NAME.cloudformation.json" \
  --stack-name "$STACK_NAME" \
  --region "${AWS_REGION:-us-west-1}" \
  --profile "${AWS_PROFILE:-westmonroe-support}" \
  --no-fail-on-empty-changeset
