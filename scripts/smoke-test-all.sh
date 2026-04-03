#!/usr/bin/env bash
# smoke-test-all.sh — Post-deploy smoke tests for all 4 sites
# Verifies public URLs through Caddy (not just container-internal health).
#
# Usage:
#   ./scripts/smoke-test-all.sh              # Test all sites
#   ./scripts/smoke-test-all.sh arlos        # Test one site
#   ./scripts/smoke-test-all.sh --json       # JSON output for automation
#
# Exit codes:
#   0 = all passed
#   1 = one or more failed
#
# Can be run from:
#   - Hatch (post-deploy verification)
#   - CI (added as post-deploy step in shared workflow)
#   - Manually (SSH to VPS or any machine with curl)

set -euo pipefail

# ──── Configuration ────

declare -A SITES=(
  [arlos]="https://arlo.chrishan.xyz"
  [recharge]="https://recharge.chrishan.xyz"
  [feed]="https://feed.chrishan.xyz"
  [home]="https://chrishan.xyz"
)

declare -A HEALTH_ENDPOINTS=(
  [arlos]="/api/health"
  [recharge]="/api/health"
  [feed]="/api/health"
  [home]="/api/health"
)

# Additional routes to verify per site (comma-separated)
# Only include PUBLIC routes — authenticated routes will return 401 through Authelia
declare -A SMOKE_ROUTES=(
  [arlos]="/"
  [recharge]="/"
  [feed]="/"
  [home]="/"
)

# Routes that are expected to require auth (accept 200 OR 401/302 as "up")
declare -A AUTH_ROUTES=(
  [arlos]="/api/tasks?status=completed&limit=1"
  [recharge]="/api/cities"
  [feed]="/api/items?limit=1"
  [home]=""
)

TIMEOUT=10
RETRIES=3
RETRY_DELAY=5
JSON_OUTPUT=false
FILTER=""

# ──── Parse args ────

for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=true ;;
    --timeout=*) TIMEOUT="${arg#*=}" ;;
    --retries=*) RETRIES="${arg#*=}" ;;
    arlos|recharge|feed|home) FILTER="$arg" ;;
    *) echo "Usage: $0 [arlos|recharge|feed|home] [--json] [--timeout=N] [--retries=N]"; exit 1 ;;
  esac
done

# ──── Functions ────

check_url() {
  local url="$1"
  local attempt=1
  local http_code=""
  local response_time=""

  while [ "$attempt" -le "$RETRIES" ]; do
    # Use curl with timing and status code
    local result
    result=$(curl -s -o /dev/null -w '%{http_code} %{time_total}' \
      --connect-timeout "$TIMEOUT" \
      --max-time "$((TIMEOUT * 2))" \
      -L "$url" 2>/dev/null) || result="000 0"

    http_code=$(echo "$result" | awk '{print $1}')
    response_time=$(echo "$result" | awk '{print $2}')

    if [ "$http_code" = "200" ]; then
      echo "$http_code $response_time"
      return 0
    fi

    if [ "$attempt" -lt "$RETRIES" ]; then
      sleep "$RETRY_DELAY"
    fi
    attempt=$((attempt + 1))
  done

  echo "$http_code $response_time"
  return 1
}

# ──── Run Tests ────

PASSED=0
FAILED=0
TOTAL=0
RESULTS=()
JSON_RESULTS="["

for site in arlos recharge feed home; do
  # Filter if specified
  if [ -n "$FILTER" ] && [ "$FILTER" != "$site" ]; then
    continue
  fi

  base_url="${SITES[$site]}"
  health_path="${HEALTH_ENDPOINTS[$site]}"
  extra_routes="${SMOKE_ROUTES[$site]}"

  # Build route list: health endpoint + extra routes
  routes=("$health_path")
  IFS=',' read -ra extra <<< "$extra_routes"
  for route in "${extra[@]}"; do
    route=$(echo "$route" | xargs)  # trim
    if [ -n "$route" ] && [ "$route" != "$health_path" ]; then
      routes+=("$route")
    fi
  done

  # Add auth routes (these accept 200/302/401 as "reachable")
  auth_route_list="${AUTH_ROUTES[$site]:-}"
  auth_route_set=""
  if [ -n "$auth_route_list" ]; then
    IFS=',' read -ra auth_extra <<< "$auth_route_list"
    for route in "${auth_extra[@]}"; do
      route=$(echo "$route" | xargs)
      if [ -n "$route" ]; then
        routes+=("$route")
        auth_route_set+="$route "
      fi
    done
  fi

  site_pass=true

  for route in "${routes[@]}"; do
    TOTAL=$((TOTAL + 1))
    url="${base_url}${route}"

    if result=$(check_url "$url"); then
      status="PASS"
      PASSED=$((PASSED + 1))
    else
      # For auth-protected routes, 401/302 means server is reachable (just needs auth)
      http_code_check=$(echo "$result" | awk '{print $1}')
      is_auth_route=false
      for ar in $auth_route_set; do
        if [ "$ar" = "$route" ]; then
          is_auth_route=true
          break
        fi
      done

      if [ "$is_auth_route" = true ] && { [ "$http_code_check" = "401" ] || [ "$http_code_check" = "302" ]; }; then
        status="PASS (auth)"
        PASSED=$((PASSED + 1))
      else
        status="FAIL"
        FAILED=$((FAILED + 1))
        site_pass=false
      fi
    fi

    http_code=$(echo "$result" | awk '{print $1}')
    response_time=$(echo "$result" | awk '{print $2}')

    if [ "$JSON_OUTPUT" = true ]; then
      [ "$TOTAL" -gt 1 ] && JSON_RESULTS+=","
      JSON_RESULTS+=$(printf '{"site":"%s","url":"%s","status":"%s","http_code":%s,"response_time_s":%s}' \
        "$site" "$url" "$status" "$http_code" "$response_time")
    else
      if [[ "$status" == PASS* ]]; then
        printf "  ✅ %-45s %s  %-12s (%.2fs)\n" "$url" "$http_code" "$status" "$response_time"
      else
        printf "  ❌ %-45s %s  %-12s (%.2fs)\n" "$url" "$http_code" "$status" "$response_time"
      fi
    fi
  done
done

# ──── Summary ────

JSON_RESULTS+="]"

if [ "$JSON_OUTPUT" = true ]; then
  printf '{"passed":%d,"failed":%d,"total":%d,"results":%s}\n' \
    "$PASSED" "$FAILED" "$TOTAL" "$JSON_RESULTS"
else
  echo ""
  if [ "$FAILED" -eq 0 ]; then
    echo "✅ All $TOTAL checks passed"
  else
    echo "❌ $FAILED/$TOTAL checks failed"
  fi
fi

[ "$FAILED" -eq 0 ]
