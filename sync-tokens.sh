#!/bin/bash
# Sync shared tokens to all app copies.
# Run from ~/workspace/shared/ after editing tokens.css.
# The canonical source is shared/css/tokens.css.
# Each app has a copy for CI/Docker compatibility.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/css/tokens.css"

TARGETS=(
  "$SCRIPT_DIR/../arlos/client/src/styles/tokens.css"
  "$SCRIPT_DIR/../feed/client/src/styles/tokens.css"
  "$SCRIPT_DIR/../recharge-2026/client/src/styles/tokens.css"
)

for target in "${TARGETS[@]}"; do
  if [ -d "$(dirname "$target")" ]; then
    cp "$SOURCE" "$target"
    echo "✅ Synced → $target"
  else
    echo "⚠️  Dir missing: $(dirname "$target")"
  fi
done

echo ""
echo "NOTE: chrishan.xyz has no build step — update home/style.css manually if tokens change."
