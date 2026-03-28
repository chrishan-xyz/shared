#!/bin/bash
# sync-middleware.sh — Copy canonical shared middleware to both projects
# Run from workspace root: bash shared/sync-middleware.sh

set -e

SHARED="shared/middleware"
ARLOS="arlos/middleware"
RECHARGE="recharge-2026/middleware"

SHARED_FILES=(
  "rate-limit.js"
  "api-version.js"
  "error-logger.js"
  "security.js"
  "graceful-shutdown.js"
  "asyncHandler.js"
)

echo "════════════════════════════════════════════════════════════"
echo " 🔄 Syncing shared middleware"
echo "════════════════════════════════════════════════════════════"

changed=0
for file in "${SHARED_FILES[@]}"; do
  # shellcheck disable=SC2034
  # Check if canonical file exists
  if [ ! -f "$SHARED/$file" ]; then
    echo "  ❌ $file — missing from shared/ (SKIPPED)"
    continue
  fi

  # Copy to ArlOS
  if [ -f "$ARLOS/$file" ]; then
    if ! diff -q "$SHARED/$file" "$ARLOS/$file" > /dev/null 2>&1; then
      cp "$SHARED/$file" "$ARLOS/$file"
      echo "  ✅ $file → arlos/ (UPDATED)"
      changed=$((changed + 1))
    else
      echo "  ✓  $file → arlos/ (no change)"
    fi
  else
    cp "$SHARED/$file" "$ARLOS/$file"
    echo "  ✅ $file → arlos/ (CREATED)"
    changed=$((changed + 1))
  fi

  # Copy to Recharge
  if [ -f "$RECHARGE/$file" ]; then
    if ! diff -q "$SHARED/$file" "$RECHARGE/$file" > /dev/null 2>&1; then
      cp "$SHARED/$file" "$RECHARGE/$file"
      echo "  ✅ $file → recharge/ (UPDATED)"
      changed=$((changed + 1))
    else
      echo "  ✓  $file → recharge/ (no change)"
    fi
  else
    cp "$SHARED/$file" "$RECHARGE/$file"
    echo "  ✅ $file → recharge/ (CREATED)"
    changed=$((changed + 1))
  fi
done

echo ""
if [ "$changed" -gt 0 ]; then
  echo "🔄 $changed file(s) updated. Commit changes in both projects."
else
  echo "✅ All shared middleware in sync. No changes needed."
fi
echo "════════════════════════════════════════════════════════════"
