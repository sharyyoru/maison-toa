#!/usr/bin/env bash
# Deploys the TarifMatcher grouper to Google Cloud Run.
#
#   GCP_PROJECT=my-project ./deploy.sh            # region defaults to europe-west6 (Zurich)
#
# One-time: the secret must exist in Secret Manager (see README.md).
set -euo pipefail

PROJECT="${GCP_PROJECT:?set GCP_PROJECT}"
REGION="${GCP_REGION:-europe-west6}"
SERVICE="${SERVICE_NAME:-maison-toa-tarifmatcher}"
SECRET="${SECRET_NAME:-tarifmatcher-secret}"

cd "$(dirname "$0")"

gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source . \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --concurrency 4 \
  --timeout 60 \
  --min-instances 0 \
  --max-instances 3 \
  --cpu-boost \
  --allow-unauthenticated \
  --set-secrets "TARIFMATCHER_SECRET=${SECRET}:latest" \
  --startup-probe "httpGet.path=/health,httpGet.port=8080,initialDelaySeconds=0,periodSeconds=5,failureThreshold=6,timeoutSeconds=3" \
  --labels app=maison-toa,component=tarifmatcher

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
echo "Deployed: $URL"
curl -fsS "$URL/health"; echo
