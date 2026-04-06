#!/bin/bash
# Sync shared tokens to all app copies.
# Run from ~/workspace/shared/ after editing tokens.css.
# The canonical source is shared/css/tokens.css.
# Each app has a copy for CI/Docker compatibility.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/css/tokens.css"

# ── Build-step apps (direct copy) ──────────────────────────────────────
TARGETS=(
  "$SCRIPT_DIR/../arlos/client/src/styles/tokens.css"
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

# ── chrishan.xyz (no build step — extract token values into style.css) ──
CHRISHAN_STYLE="$SCRIPT_DIR/../chrishan.xyz/home/style.css"
if [ -f "$CHRISHAN_STYLE" ]; then
  echo ""
  echo "ℹ️  chrishan.xyz uses shared token values directly in home/style.css"
  echo "   Verify manually: diff shared values against home/style.css :root block"
  echo "   File: $CHRISHAN_STYLE"
fi

# ── Brain (uses --ctp-* namespace with shared aliases in index.css) ──
echo ""
echo "ℹ️  Brain uses --ctp-* namespace with shared token aliases in index.css"
echo "   Brain's aliases map --bg-base → var(--ctp-base) etc."
echo "   If shared tokens change, verify Brain aliases still match."
echo "   File: $SCRIPT_DIR/../brain/client/src/index.css"
