#!/usr/bin/env bash
# Add public availability/disk checks; notifications use the owner's existing channel.
set -euo pipefail
PROJECT="${1:?Google Cloud project required}"
DOMAIN="${2:-dcss.iancaltabiano.com}"
CHANNEL="${3:?Existing owner notification channel required}"
CHECK="$(gcloud monitoring uptime list-configs --project="$PROJECT" --filter='displayName="DCSS availability and disk"' --format='value(name)')"
if [[ -z "$CHECK" ]]; then
    CHECK="$(gcloud monitoring uptime create 'DCSS availability and disk' --project="$PROJECT" --resource-type=uptime-url --resource-labels="host=$DOMAIN,project_id=$PROJECT" --protocol=https --port=443 --path=/healthz --validate-ssl=true --period=5 --timeout=10 --regions=usa-iowa,usa-oregon,usa-virginia --matcher-type=contains-string --matcher-content='"ok":true' --user-labels=customer=rogue,app=dcss-coop --format='value(name)')"
fi
POLICY="$(gcloud monitoring policies list --project="$PROJECT" --filter='displayName="DCSS availability and disk"' --format='value(name)')"
if [[ -z "$POLICY" ]]; then
    POLICY_FILE="$(mktemp)"
    trap 'rm -f "$POLICY_FILE"' EXIT
    python3 - "$CHECK" "$CHANNEL" "$DOMAIN" "$POLICY_FILE" <<'PY'
import json, pathlib, sys
check, channel, domain, destination = sys.argv[1:]
condition = {
    "displayName": "Game unavailable or state disk below 15% free in two regions",
    "conditionThreshold": {
        "filter": 'resource.type="uptime_url" AND metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.label.check_id="' + check.rsplit('/', 1)[-1] + '"',
        "aggregations": [{"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_NEXT_OLDER", "crossSeriesReducer": "REDUCE_COUNT_FALSE", "groupByFields": ["resource.label.host"]}],
        "comparison": "COMPARISON_GT", "thresholdValue": 1, "duration": "300s", "trigger": {"count": 1}
    }
}
policy = {"displayName": "DCSS availability and disk", "combiner": "OR", "enabled": True,
          "conditions": [condition], "notificationChannels": [channel],
          "userLabels": {"customer": "rogue", "app": "dcss-coop"},
          "documentation": {"mimeType": "text/markdown", "content": "Check https://" + domain + "/healthz and the dcss-coop and dcss-health systemd units."}}
pathlib.Path(destination).write_text(json.dumps(policy))
PY
    gcloud monitoring policies create --project="$PROJECT" --policy-from-file="$POLICY_FILE"
fi
printf 'Uptime check: %s\n' "$CHECK"
