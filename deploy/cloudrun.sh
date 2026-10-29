# Optional ephemeral demonstration, sourced by deploy_gcloud.sh.
echo 'Cloud Run demonstration: local accounts/saves are ephemeral.' >&2
repository="dcss-coop-repo"
image="$REGION-docker.pkg.dev/$PROJECT_ID/$repository/$INSTANCE_NAME:latest"
if "$DRY_RUN" || ! gcloud artifacts repositories describe "$repository" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
    run_cmd gcloud artifacts repositories create "$repository" --project="$PROJECT_ID" --location="$REGION" --repository-format=docker --labels="$REQUIRED_LABELS"
fi
run_cmd gcloud builds submit "$SCRIPT_DIR" --project="$PROJECT_ID" --tag="$image"
run_cmd gcloud run deploy "$INSTANCE_NAME" --project="$PROJECT_ID" --region="$REGION" --image="$image" --labels="$REQUIRED_LABELS" --session-affinity --timeout=3600 --allow-unauthenticated --port="$PORT" --cpu=2 --memory=2Gi --max-instances=1
