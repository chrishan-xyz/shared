#!/bin/bash
# check-drift.sh — Verify project middleware matches canonical shared versions
# Run from workspace root: bash shared/check-drift.sh
# Exit code 0 = in sync, 1 = drift detected
# Can be added to deploy pipelines as a pre-deploy gate

set -e

SHARED="shared/middleware"

SHARED_FILES=(
  "rate-limit.js"
  "api-version.js"
  "error-logger.js"
  "security.js"
  "graceful-shutdown.js"
  "asyncHandler.js"
  "timeout.js"
)

# Accept project path as argument, or check both
PROJECTS=("arlos/middleware" "recharge-2026/middleware")
if [ -n "$1" ]; then
  PROJECTS=("$1/middleware")
fi

echo "════════════════════════════════════════════════════════════"
echo " 🔍 Checking middleware drift"
echo "════════════════════════════════════════════════════════════"

drift=0
for project in "${PROJECTS[@]}"; do
  project_name=$(echo "$project" | cut -d'/' -f1)
  echo ""
  echo "  📁 $project_name:"
  
  for file in "${SHARED_FILES[@]}"; do
    if [ ! -f "$SHARED/$file" ]; then
      continue
    fi

    if [ ! -f "$project/$file" ]; then
      echo "    ❌ $file — MISSING"
      drift=$((drift + 1))
      continue
    fi

    if diff -q "$SHARED/$file" "$project/$file" > /dev/null 2>&1; then
      echo "    ✅ $file"
    else
      echo "    ⚠️  $file — DRIFTED"
      diff --unified=0 "$SHARED/$file" "$project/$file" 2>/dev/null | head -10
      drift=$((drift + 1))
    fi
  done
done

echo ""
if [ "$drift" -gt 0 ]; then
  echo "⚠️  $drift file(s) have drifted from canonical versions."
  echo "   Run: bash shared/sync-middleware.sh"
  exit 1
else
  echo "✅ All shared middleware matches canonical versions."
  exit 0
fi
echo "════════════════════════════════════════════════════════════"
