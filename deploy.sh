#!/bin/bash

echo "Starting local deployment to Google Cloud Run..."
echo "This will use your local .env file for both build and runtime environment variables."

# Deploy using the local source code.
# This will upload the directory (including .env since we removed it from .gcloudignore),
# build the Docker image in Cloud Build, and deploy it to Cloud Run.
gcloud run deploy rdc-goa-portal \
  --source . \
  --project rdc-goa-portal \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated

echo "Deployment finished! Check the logs above for the live URL."
