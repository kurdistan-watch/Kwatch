#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-proxy.sh — Smoke-test the Vercel serverless proxies locally
#
# Prerequisites:
#   1. npm i -g vercel          (install Vercel CLI)
#   2. vercel link              (link to your Vercel project)
#   3. cp .env.example .env     (fill in OPENSKY_USERNAME / OPENSKY_PASSWORD)
#   4. vercel dev               (start local dev server — default port 3000)
#
# Usage:
#   ./scripts/test-proxy.sh              # uses http://localhost:3000
#   ./scripts/test-proxy.sh 5173         # custom port
#   ./scripts/test-proxy.sh 3000 verbose # show full JSON response bodies
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PORT="${1:-3000}"
VERBOSE="${2:-}"
BASE="http://localhost:${PORT}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

pass=0
fail=0

# ── Helper ────────────────────────────────────────────────────────────────────

check() {
    local label="$1"
    local url="$2"
    local expect_field="$3"  # jq expression that should return non-null

    printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    printf "${YELLOW}TEST:${NC} %s\n" "$label"
    printf "${YELLOW}URL:${NC}  %s\n" "$url"

    # Capture HTTP status + body
    local http_code body
    body=$(curl -s -w '\n%{http_code}' --max-time 30 "$url")
    http_code=$(echo "$body" | tail -1)
    body=$(echo "$body" | sed '$d')

    printf "${YELLOW}HTTP:${NC} %s\n" "$http_code"

    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
        # Check expected field exists in JSON
        local val
        val=$(echo "$body" | jq -r "$expect_field" 2>/dev/null || echo "PARSE_ERROR")

        if [[ "$val" != "null" && "$val" != "PARSE_ERROR" && -n "$val" ]]; then
            printf "${GREEN}✅ PASS${NC} — %s = %s\n" "$expect_field" "$(echo "$val" | head -c 120)"
            ((pass++))
        else
            printf "${RED}❌ FAIL${NC} — expected %s to be non-null, got: %s\n" "$expect_field" "$val"
            ((fail++))
        fi

        if [[ "$VERBOSE" == "verbose" ]]; then
            echo "$body" | jq '.' 2>/dev/null | head -60
        fi
    else
        printf "${RED}❌ FAIL${NC} — HTTP %s\n" "$http_code"
        echo "$body" | head -5
        ((fail++))
    fi
    echo ""
}

# ── Connectivity check ────────────────────────────────────────────────────────

printf "\n${CYAN}🔍 Testing Vercel dev server at ${BASE}${NC}\n\n"

if ! curl -s --max-time 5 "$BASE" > /dev/null 2>&1; then
    printf "${RED}ERROR:${NC} Cannot reach ${BASE}\n"
    printf "Make sure 'vercel dev' is running on port ${PORT}\n"
    exit 1
fi

# ── Test 1: OpenSky proxy — full EMEA bounding box ───────────────────────────

check \
    "OpenSky proxy — EMEA bounding box (should return flight states)" \
    "${BASE}/api/opensky?lamin=-35&lomin=-25&lamax=72&lomax=63" \
    ".time"

# ── Test 2: OpenSky proxy — small bbox around Erbil ──────────────────────────

check \
    "OpenSky proxy — Erbil region (smaller bbox)" \
    "${BASE}/api/opensky?lamin=35.5&lomin=43.5&lamax=36.5&lomax=44.5" \
    ".time"

# ── Test 3: OpenSky proxy — no params (should still work) ────────────────────

check \
    "OpenSky proxy — no bounding box (global, may be slow)" \
    "${BASE}/api/opensky" \
    ".time"

# ── Test 4: Planespotters proxy — known aircraft (Boeing 737 demo hex) ───────

check \
    "Planespotters proxy — photo lookup for icao24 'a835af'" \
    "${BASE}/api/planespotters/pub/photos/hex/a835af" \
    ".photos"

# ── Test 5: Planespotters proxy — unknown hex (should return empty) ──────────

check \
    "Planespotters proxy — unknown hex '000000' (expect empty photos array)" \
    "${BASE}/api/planespotters/pub/photos/hex/000000" \
    ".photos"

# ── Test 6: Method not allowed ───────────────────────────────────────────────

printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${YELLOW}TEST:${NC} OpenSky proxy — POST should return 405\n"
post_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "${BASE}/api/opensky")
if [[ "$post_code" == "405" ]]; then
    printf "${GREEN}✅ PASS${NC} — HTTP 405 Method Not Allowed\n"
    ((pass++))
else
    printf "${RED}❌ FAIL${NC} — expected 405, got %s\n" "$post_code"
    ((fail++))
fi
echo ""

# ── Test 7: SPA fallback — non-API route returns index.html ──────────────────

printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${YELLOW}TEST:${NC} SPA fallback — /some/random/route returns HTML\n"
spa_body=$(curl -s --max-time 10 "${BASE}/some/random/route")
if echo "$spa_body" | grep -q '<div id="root">' 2>/dev/null; then
    printf "${GREEN}✅ PASS${NC} — SPA fallback returns index.html\n"
    ((pass++))
else
    printf "${RED}❌ FAIL${NC} — did not find <div id=\"root\"> in response\n"
    ((fail++))
fi
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────

printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${CYAN}RESULTS:${NC} ${GREEN}%d passed${NC}  ${RED}%d failed${NC}  (total: %d)\n" "$pass" "$fail" "$((pass + fail))"

if [[ "$fail" -gt 0 ]]; then
    printf "\n${RED}Some tests failed.${NC} Check output above.\n"
    exit 1
else
    printf "\n${GREEN}All tests passed! ✅${NC} Ready for deployment.\n"
    exit 0
fi
