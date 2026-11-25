#!/usr/bin/env bash
set -euo pipefail

PROFILE="${AWS_PROFILE:-westmonroe-support}"
REGION="us-west-1"
CLOUDFRONT_ORIGIN_PREFIX_LIST="pl-4ea04527"

revoke_if_present() {
  local group_id="$1"
  local port="$2"
  local has_rule

  has_rule="$(aws --profile "$PROFILE" --region "$REGION" ec2 describe-security-groups \
    --group-ids "$group_id" --output json | python3 -c '
import json, sys
port, prefix = int(sys.argv[1]), sys.argv[2]
group = json.load(sys.stdin)["SecurityGroups"][0]
found = any(
    permission.get("IpProtocol") == "tcp"
    and permission.get("FromPort") == port
    and permission.get("ToPort") == port
    and any(entry.get("PrefixListId") == prefix for entry in permission.get("PrefixListIds", []))
    for permission in group.get("IpPermissions", [])
)
print("yes" if found else "no")
' "$port" "$CLOUDFRONT_ORIGIN_PREFIX_LIST")"

  if [[ "$has_rule" == "yes" ]]; then
    aws --profile "$PROFILE" --region "$REGION" ec2 revoke-security-group-ingress \
      --group-id "$group_id" \
      --ip-permissions "IpProtocol=tcp,FromPort=$port,ToPort=$port,PrefixListIds=[{PrefixListId=$CLOUDFRONT_ORIGIN_PREFIX_LIST}]"
    echo "Removed direct CloudFront ingress to UAT on TCP/$port from $group_id."
  else
    echo "Direct CloudFront ingress on TCP/$port is already absent from $group_id."
  fi
}

# CloudFront now reaches UAT through the ALB. Keep only the ALB security-group
# ingress on TCP/80; remove the obsolete direct-origin paths.
revoke_if_present "sg-0c70c1e40148e1216" 80
revoke_if_present "sg-012b1bb78d2d54008" 443
