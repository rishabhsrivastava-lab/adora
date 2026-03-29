#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────
STACK_NAME="adora-coatings"
REGION="us-east-1"
SITE_DIR="$(cd "$(dirname "$0")/../site" && pwd)"
export AWS_PROFILE="${AWS_PROFILE:-adora}"

# Get outputs from CloudFormation
echo "Fetching stack outputs..."
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" \
  --output text)

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text)

echo "Bucket: $BUCKET_NAME"
echo "Distribution: $DISTRIBUTION_ID"
echo "Site dir: $SITE_DIR"
echo ""

# ── Sync files by type with correct Content-Type headers ───────────
echo "Syncing files to S3..."

# 1. HTML files (short cache)
echo "  [1/11] HTML files..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.html" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "public, max-age=300" \
  --region "$REGION"

# 2. CSS files
echo "  [2/11] CSS files..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.css" \
  --content-type "text/css" \
  --cache-control "public, max-age=3600" \
  --region "$REGION"

# 3. JavaScript files
echo "  [3/11] JavaScript files..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.js" \
  --content-type "application/javascript" \
  --cache-control "public, max-age=3600" \
  --region "$REGION"

# 4. WOFF2 font files
echo "  [4/11] Font files..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.woff2" \
  --content-type "font/woff2" \
  --cache-control "public, max-age=86400" \
  --region "$REGION"

# 5. JPEG images
echo "  [5/11] JPEG images..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.jpg" --include "*.jpeg" \
  --content-type "image/jpeg" \
  --cache-control "public, max-age=86400" \
  --region "$REGION"

# 6. PNG images
echo "  [6/11] PNG images..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.png" \
  --content-type "image/png" \
  --cache-control "public, max-age=86400" \
  --region "$REGION"

# 7. WebP images
echo "  [7/11] WebP images..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.webp" \
  --content-type "image/webp" \
  --cache-control "public, max-age=86400" \
  --region "$REGION"

# 8. AVIF images
echo "  [8/11] AVIF images..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.avif" \
  --content-type "image/avif" \
  --cache-control "public, max-age=86400" \
  --region "$REGION"

# 9. XML files (sitemap)
echo "  [9/11] XML files..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.xml" \
  --content-type "application/xml" \
  --cache-control "public, max-age=3600" \
  --region "$REGION"

# 10. Text files (robots.txt)
echo "  [10/11] Text files..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.txt" \
  --content-type "text/plain" \
  --cache-control "public, max-age=3600" \
  --region "$REGION"

# 11. ICO files (favicon)
echo "  [11/11] ICO/SVG files..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.ico" \
  --content-type "image/x-icon" \
  --cache-control "public, max-age=86400" \
  --region "$REGION"

aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --exclude "*" --include "*.svg" \
  --content-type "image/svg+xml" \
  --cache-control "public, max-age=86400" \
  --region "$REGION"

# Cleanup pass: delete orphaned files from S3
echo ""
echo "Cleanup: removing orphaned files..."
aws s3 sync "$SITE_DIR" "s3://$BUCKET_NAME" \
  --delete \
  --region "$REGION"

# ── Invalidate CloudFront cache ────────────────────────────────────
echo ""
echo "Invalidating CloudFront cache..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --region "$REGION" \
  --query "Invalidation.Id" \
  --output text)

echo "Invalidation created: $INVALIDATION_ID"
echo ""
echo "=== Deployment complete ==="
echo ""
echo "CloudFront URL: https://$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" \
  --output text)"
echo ""
echo "Changes will be visible within ~60 seconds after invalidation completes."
