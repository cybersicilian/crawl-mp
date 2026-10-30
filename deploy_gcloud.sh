#!/usr/bin/env bash
# Stateful WebTiles deployment. Credentials and runtime data never enter releases.
set -euo pipefail
export CLOUDSDK_METRICS_ENVIRONMENT="${CLOUDSDK_METRICS_ENVIRONMENT:+$CLOUDSDK_METRICS_ENVIRONMENT }datacloud.antigravity"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ID=""
ZONE="us-central1-a"
REGION="us-central1"
INSTANCE_NAME="dcss-coop-server"
MACHINE_TYPE="e2-medium"
DOMAIN="dcss.iancaltabiano.com"
PORT="8080"
MODE="gce"
DRY_RUN=false
BUNDLE=""
REQUIRED_LABELS="customer=rogue,app=dcss-coop"

usage() {
    cat <<'EOF'
Usage: ./deploy_gcloud.sh [--project ID] [--zone ZONE] [--region REGION]
       [--instance NAME] [--machine-type TYPE] [--domain HOST] [--port PORT]
       [--mode gce|cloudrun] [--bundle DIRECTORY] [--dry-run]

GCE: isolated network, reserved IP, 20 GB boot + 10 GB retained state disk,
daily state snapshots (7 days), Caddy HTTPS, and atomic application releases.
Cloud Run: ephemeral demonstration only; does not persist accounts or saves.
DNS must point --domain to the reserved IP before HTTPS can become ready.
--bundle deploys the verified frozen archive, preserving its release ID.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --project) PROJECT_ID="${2:?Missing project}"; shift 2 ;;
        --zone) ZONE="${2:?Missing zone}"; shift 2 ;;
        --region) REGION="${2:?Missing region}"; shift 2 ;;
        --instance) INSTANCE_NAME="${2:?Missing name}"; shift 2 ;;
        --machine-type) MACHINE_TYPE="${2:?Missing type}"; shift 2 ;;
        --domain) DOMAIN="${2:?Missing hostname}"; shift 2 ;;
        --port) PORT="${2:?Missing port}"; shift 2 ;;
        --mode) MODE="${2:?Missing mode}"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --bundle) BUNDLE="${2:?Missing bundle directory}"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) printf 'Unknown option: %s\n' "$1" >&2; usage; exit 1 ;;
    esac
done
[[ "$MODE" == gce || "$MODE" == cloudrun ]] || { usage; exit 1; }
[[ "$PORT" =~ ^[0-9]+$ && "$PORT" -gt 1024 && "$PORT" -lt 65536 ]]
[[ "$DOMAIN" =~ ^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$ ]]
[[ "$INSTANCE_NAME" =~ ^[a-z][a-z0-9-]{0,50}$ ]]

RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"
BOOTSTRAP="$SCRIPT_DIR/deploy/gce_startup.sh"
if [[ -n "$BUNDLE" ]]; then
    [[ "$MODE" == gce ]] || { echo '--bundle requires --mode gce.' >&2; exit 1; }
    BUNDLE="$(cd "$BUNDLE" && pwd)"
    python3 "$SCRIPT_DIR/deploy/prepare_release.py" verify "$BUNDLE"
    RELEASE_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["release_id"])' "$BUNDLE/release.json")"
    [[ "$RELEASE_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]]
    BUNDLE_TEMP="$(mktemp -d "${TMPDIR:-/tmp}/dcss-bootstrap.XXXXXX")"
    trap 'rm -rf "$BUNDLE_TEMP"' EXIT
    BOOTSTRAP="$BUNDLE_TEMP/gce_startup.sh"
    python3 - "$BUNDLE/source.tar.gz" "$BOOTSTRAP" <<'PY'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1]) as archive:
    pathlib.Path(sys.argv[2]).write_bytes(archive.extractfile("deploy/gce_startup.sh").read())
PY
fi

run_cmd() {
    if "$DRY_RUN"; then
        printf '[dry-run] '; printf '%q ' "$@"; printf '\n'
    else
        "$@"
    fi
}

if ! "$DRY_RUN"; then
    account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
    [[ -n "$account" ]] || { echo 'Run gcloud auth login first.' >&2; exit 1; }
    PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
    [[ -n "$PROJECT_ID" && "$PROJECT_ID" != '(unset)' ]]
    echo "Deploying as $account in $PROJECT_ID ($MODE)."
    [[ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)')" == True ]]
else
    PROJECT_ID="${PROJECT_ID:-preview-project}"
fi
[[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]+$ ]]

if [[ "$MODE" == cloudrun ]]; then
    source "$SCRIPT_DIR/deploy/cloudrun.sh"
    exit
fi

NETWORK="dcss-coop"
SUBNET="dcss-coop-$REGION"
ADDRESS="$INSTANCE_NAME-ip"
STATE_DISK="$INSTANCE_NAME-data"
BACKUP_POLICY="dcss-daily"

ensure_resource() {
    local kind="$1" name="$2" scope="$3"
    shift 3
    if "$DRY_RUN" || ! gcloud compute "$kind" describe "$name" --project="$PROJECT_ID" "$scope" >/dev/null 2>&1; then
        run_cmd gcloud compute "$kind" create "$name" --project="$PROJECT_ID" "$@"
    fi
}

ensure_resource networks "$NETWORK" --quiet --subnet-mode=custom --description='DCSS co-op isolated network'
if "$DRY_RUN" || ! gcloud compute networks subnets describe "$SUBNET" --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
    run_cmd gcloud compute networks subnets create "$SUBNET" --project="$PROJECT_ID" --region="$REGION" --network="$NETWORK" --range=10.78.0.0/24
fi
ensure_resource firewall-rules dcss-web --quiet --network="$NETWORK" --direction=INGRESS --action=ALLOW --rules=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 --target-tags=dcss-coop
ensure_resource firewall-rules dcss-iap-ssh --quiet --network="$NETWORK" --direction=INGRESS --action=ALLOW --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=dcss-coop
ensure_resource addresses "$ADDRESS" "--region=$REGION" --region="$REGION" --network-tier=PREMIUM
ensure_resource disks "$STATE_DISK" "--zone=$ZONE" --zone="$ZONE" --size=10GB --type=pd-balanced --labels="$REQUIRED_LABELS"
if "$DRY_RUN" || ! gcloud compute resource-policies describe "$BACKUP_POLICY" --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
    run_cmd gcloud compute resource-policies create snapshot-schedule "$BACKUP_POLICY" --project="$PROJECT_ID" --region="$REGION" --daily-schedule --start-time=04:00 --max-retention-days=7 --on-source-disk-delete=keep-auto-snapshots --storage-location=us --snapshot-labels="$REQUIRED_LABELS"
fi
if "$DRY_RUN" || ! gcloud compute disks describe "$STATE_DISK" --project="$PROJECT_ID" --zone="$ZONE" --format='value(resourcePolicies)' | grep -q "/$BACKUP_POLICY$"; then
    run_cmd gcloud compute disks add-resource-policies "$STATE_DISK" --project="$PROJECT_ID" --zone="$ZONE" --resource-policies="$BACKUP_POLICY"
fi

EXTERNAL_IP='<reserved-ip>'
if ! "$DRY_RUN"; then
    EXTERNAL_IP="$(gcloud compute addresses describe "$ADDRESS" --project="$PROJECT_ID" --region="$REGION" --format='value(address)')"
fi
ensure_resource instances "$INSTANCE_NAME" "--zone=$ZONE" --zone="$ZONE" --machine-type="$MACHINE_TYPE" --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud --boot-disk-size=20GB --boot-disk-type=pd-balanced --subnet="$SUBNET" --address="$EXTERNAL_IP" --tags=dcss-coop --labels="$REQUIRED_LABELS" --no-service-account --no-scopes --metadata=serial-port-enable=FALSE --disk="name=$STATE_DISK,device-name=dcss-data,mode=rw,boot=no,auto-delete=no"
run_cmd gcloud compute disks add-labels "$INSTANCE_NAME" --project="$PROJECT_ID" --zone="$ZONE" --labels="$REQUIRED_LABELS"

ARCHIVE="${TMPDIR:-/tmp}/dcss-$RELEASE_ID.tar.gz"
if [[ -n "$BUNDLE" ]]; then
    ARCHIVE="$BUNDLE/source.tar.gz"
elif "$DRY_RUN"; then
    echo "[dry-run] Package tracked and new source files, excluding credentials and runtime state."
else
    python3 "$SCRIPT_DIR/deploy/package_source.py" "$SCRIPT_DIR" "$ARCHIVE"
fi
run_cmd gcloud compute scp "$ARCHIVE" "$INSTANCE_NAME:/tmp/dcss-$RELEASE_ID.tar.gz" --project="$PROJECT_ID" --zone="$ZONE" --tunnel-through-iap --quiet
run_cmd gcloud compute scp "$BOOTSTRAP" "$INSTANCE_NAME:/tmp/dcss-bootstrap.sh" --project="$PROJECT_ID" --zone="$ZONE" --tunnel-through-iap --quiet
run_cmd gcloud compute ssh "$INSTANCE_NAME" --project="$PROJECT_ID" --zone="$ZONE" --tunnel-through-iap --quiet --command="sudo bash /tmp/dcss-bootstrap.sh /tmp/dcss-$RELEASE_ID.tar.gz $RELEASE_ID $DOMAIN $PORT"
if ! "$DRY_RUN" && [[ -z "$BUNDLE" ]]; then rm -f "$ARCHIVE"; fi
printf '\nDNS: A %s -> %s (DNS only initially)\n' "$DOMAIN" "$EXTERNAL_IP"
printf 'Target URL: https://%s (verify DNS, TLS and gameplay before declaring live)\n' "$DOMAIN"
