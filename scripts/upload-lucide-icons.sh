#!/usr/bin/env bash
# Uploads build-icons/lucide/ to chat/icons/lucide/ on the CDN buckets.
# Used by publish-cdn.yml and publish-icons.yml. Needs BUCKET and DIST_ID.
# BUCKET_BACKUP is optional. Run scripts/build-lucide-icons.js first.
#
# The upload only adds and overwrites. It never deletes, so a name that a later
# Lucide version removes stays available for the embeds that use it.
set -euo pipefail

SRC="build-icons/lucide"
DEST="chat/icons/lucide"

[ -f "$SRC/manifest.json" ] || { echo "Run scripts/build-lucide-icons.js first" >&2; exit 1; }

for B in "$BUCKET" ${BUCKET_BACKUP:+"$BUCKET_BACKUP"}; do
  echo "uploading header icons to s3://$B/$DEST/"
  aws s3 cp "$SRC/" "s3://$B/$DEST/" --recursive --exclude "*" --include "*.svg" \
    --content-type "image/svg+xml" \
    --cache-control "public, max-age=86400" \
    --only-show-errors
  aws s3 cp "$SRC/manifest.json" "s3://$B/$DEST/manifest.json" \
    --content-type "application/json" --cache-control "public, max-age=300" --only-show-errors
  aws s3 cp "$SRC/LICENSE.txt" "s3://$B/$DEST/LICENSE.txt" \
    --content-type "text/plain; charset=utf-8" --cache-control "public, max-age=86400" --only-show-errors
done

# CloudFront can hold an error response for a name that did not exist before.
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/$DEST/*" > /dev/null
echo "done: $(grep -o '"count":[0-9]*' "$SRC/manifest.json")"

# Check the CDN the way a browser uses it. Chrome and Firefox add a `Priority`
# header to every fetch(). CloudFront adds the CORS headers only when all
# request headers are on the allow-list of its response headers policy, so a
# policy without `Access-Control-Allow-Headers: *` answers a browser with no
# CORS header, and the widget then shows the default icon. A plain curl request
# does not show this. See SELF_HOSTING.md.
CHECK_URL="${CDN_PUBLIC_URL:-https://cdn.punku.ai}/$DEST/manifest.json"
if curl -fsS -o /dev/null -D - -H "Origin: https://customer.example.com" -H "Priority: u=1, i" "$CHECK_URL" \
  | grep -qi '^access-control-allow-origin:'; then
  echo "CORS check passed: $CHECK_URL"
else
  echo "CORS check FAILED: no Access-Control-Allow-Origin for a browser-like request to $CHECK_URL" >&2
  echo "Fix the CloudFront response headers policy (Access-Control-Allow-Headers: *). See SELF_HOSTING.md." >&2
  exit 1
fi
