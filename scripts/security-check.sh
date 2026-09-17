#!/usr/bin/env bash
#
# Checks the live site's security posture from the outside.
#
#   bash scripts/security-check.sh https://aptentech.com 3.218.41.249
#
# Run by the deploy workflow after every release, and safe to run by hand at any time. It
# changes nothing — every check is a read.
#
# The point is that these controls are easy to lose and hard to notice losing. A port opened
# in the AWS console to debug something at 2am, a header dropped when a config is rewritten,
# an nginx block edited by certbot — none of those announce themselves, and the site keeps
# serving pages either way. This turns each one into a failed workflow run and an email.
#
# It deliberately verifies from outside rather than reconciling from inside. Checking what the
# internet can actually reach needs no AWS credentials and no write access to anything, and it
# tests the property that matters rather than the configuration that is supposed to produce it:
# a security group can be correct in the console and wrong in effect.

set -uo pipefail

SITE="${1:-}"
HOST="${2:-}"

if [ -z "$SITE" ]; then
  echo "usage: bash scripts/security-check.sh <site-url> [origin-host-or-ip]" >&2
  exit 2
fi

SITE="${SITE%/}"
FAILURES=0
WARNINGS=0

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
pass() { printf '  \033[32mok\033[0m    %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAILURES=$((FAILURES + 1)); }
warn() { printf '  \033[33mwarn\033[0m  %s\n' "$*"; WARNINGS=$((WARNINGS + 1)); }

# One fetch of the headers, reused by every header check below. A failure here is fatal on
# its own — there is nothing to check if the site does not answer.
HEADERS="$(curl -sS -D - -o /dev/null --max-time 30 "$SITE/" 2>/dev/null || true)"
if [ -z "$HEADERS" ]; then
  echo "Could not reach $SITE — nothing to check." >&2
  exit 1
fi

# ---------------------------------------------------------------- 1. closed ports
#
# The application listens on 3000 and 4000 and MongoDB on 27017, all of which must be
# reachable only from the instance itself. If any of these answers the internet, the
# security group has been opened — an unauthenticated content API, or the database.

bold "Ports that must not answer the internet"

if [ -n "$HOST" ]; then
  # 5 seconds is long enough for an open port to complete a handshake and short enough that
  # a filtered port — which never replies at all — does not stall the run.
  check_closed() {
    local port="$1" label="$2"
    if timeout 5 bash -c "exec 3<>/dev/tcp/$HOST/$port" 2>/dev/null; then
      fail "$port ($label) is OPEN to the internet"
    else
      pass "$port ($label) is closed"
    fi
  }

  check_closed 3000 "Next.js"
  check_closed 4000 "Node API"
  check_closed 27017 "MongoDB"

  # 22 is expected to be open: the deploy reaches the server over SSH. Worth printing so the
  # attack surface is stated rather than assumed, but it is not a failure.
  if timeout 5 bash -c "exec 3<>/dev/tcp/$HOST/22" 2>/dev/null; then
    warn "22 (SSH) is open — required by the deploy; restrict the source range if you can"
  fi
else
  warn "no origin host given, so open-port checks were skipped"
fi

# ---------------------------------------------------------------- 2. transport

bold "Transport"

# Asked first and asked plainly, because the checks below cannot distinguish a well-configured
# server from an absent one.
#
# "TLS 1.0 refused" is what this script printed on the morning port 443 had stopped listening
# altogether: the handshake fails either way. A missing HTTPS listener has to be its own
# question, or it reads as three passes.
if [ "${SITE#https://}" != "$SITE" ]; then
  HTTPS_HOST="${SITE#https://}"; HTTPS_HOST="${HTTPS_HOST%%/*}"
  if timeout 10 bash -c "exec 3<>/dev/tcp/$HTTPS_HOST/443" 2>/dev/null; then
    pass "443 is listening"
  else
    fail "443 is NOT listening — the site has no HTTPS at all"
  fi
fi

REDIRECT="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "http://${SITE#https://}/" 2>/dev/null || true)"
case "$REDIRECT" in
  30*https://*) pass "http redirects to https (${REDIRECT})" ;;
  *) fail "http does not redirect to https (got: ${REDIRECT:-no answer})" ;;
esac

# TLS 1.0 and 1.1 are withdrawn and have known weaknesses. A server that still negotiates
# them lets a downgrade attack land on a protocol nobody should be speaking.
for version in tls1 tls1_1; do
  if curl -sS -o /dev/null --max-time 15 "--$version" "$SITE/" 2>/dev/null; then
    fail "the server still accepts ${version/_/.}"
  else
    pass "${version/_/.} refused"
  fi
done

# ---------------------------------------------------------------- 3. response headers
#
# Each of these is a control the browser enforces on our behalf, and each is one deleted line
# away from being gone. The pattern is matched loosely on purpose: this checks the header is
# present and says roughly the right thing, not that its value is byte-identical, so tightening
# a policy does not fail the build.

bold "Security headers"

require_header() {
  local name="$1" pattern="$2" why="$3"
  local line
  line="$(printf '%s' "$HEADERS" | grep -i "^${name}:" | head -1 | tr -d '\r')"
  if [ -z "$line" ]; then
    fail "$name is missing — $why"
  elif printf '%s' "$line" | grep -qiE "$pattern"; then
    pass "$name"
  else
    fail "$name is present but unexpected: $line"
  fi
}

require_header "Strict-Transport-Security" "max-age=[0-9]{6,}" "a first visit over http stays hijackable"
require_header "X-Content-Type-Options" "nosniff" "an uploaded file could be executed as script"
require_header "X-Frame-Options" "DENY|SAMEORIGIN" "the admin could be framed and clickjacked"
require_header "Referrer-Policy" "no-referrer|strict-origin|same-origin" "full URLs leak to third parties"
require_header "Permissions-Policy" "camera=|geolocation=" "browser features stay available to injected code"

# Content-Security-Policy is reported rather than required, because it is not shipped yet.
# Raising it as a warning keeps it visible without failing every run for a known gap.
if printf '%s' "$HEADERS" | grep -qi "^content-security-policy:"; then
  pass "Content-Security-Policy"
else
  warn "Content-Security-Policy is not sent — the strongest control against injected script is absent"
fi

# nginx announces its exact version by default, which hands over the list of CVEs to try.
if printf '%s' "$HEADERS" | grep -qiE "^server: .*[0-9]+\.[0-9]+"; then
  warn "$(printf '%s' "$HEADERS" | grep -i '^server:' | tr -d '\r') — set server_tokens off"
else
  pass "no server version disclosed"
fi

# ---------------------------------------------------------------- 4. the admin

bold "Admin"

# Followed to the end, because `/admin/` is a redirect and Next.js does not attach custom
# headers to a redirect response. What has to carry noindex is the page that finally renders;
# checking the redirect instead reports a failure that is an artefact of the check.
ADMIN_HEADERS="$(curl -sSL -D - -o /dev/null --max-time 25 "$SITE/admin/" 2>/dev/null || true)"

if printf '%s' "$ADMIN_HEADERS" | grep -qi "^x-robots-tag:.*noindex"; then
  pass "/admin carries X-Robots-Tag: noindex"
else
  fail "/admin is missing X-Robots-Tag: noindex — the CMS can be indexed"
fi

# An unauthenticated request to an admin API must never come back with data. 401 or a redirect
# to the login are both correct; 200 with a body is not.
ADMIN_API="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/api/admin/leads" 2>/dev/null || true)"
case "$ADMIN_API" in
  401|403|404|30*) pass "/api/admin/leads refuses an unauthenticated request ($ADMIN_API)" ;;
  200) fail "/api/admin/leads answered 200 without a session — lead data is exposed" ;;
  *) warn "/api/admin/leads answered $ADMIN_API — check what that is" ;;
esac

# ---------------------------------------------------------------- 5. the origin by IP
#
# nginx's default server returns 444 so that a domain pointed at this instance, or a scanner
# walking the address space, gets nothing. If the IP starts serving the site, the CDN or any
# future WAF can be stepped around by addressing the origin directly.

if [ -n "$HOST" ]; then
  bold "Origin by raw IP"
  # No `|| echo`: curl already writes 000 through -w when the connection fails, and a
  # fallback on top of that produced "000000".
  IP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "http://$HOST/" 2>/dev/null || true)"
  if [ "$IP_CODE" = "000" ]; then
    pass "the raw IP serves nothing over http"
  else
    warn "http://$HOST/ answered $IP_CODE — the origin is reachable without the domain"
  fi
fi

# ---------------------------------------------------------------- verdict

printf '\n%s\n' "$(printf '%.0s-' {1..66})"

if [ "$FAILURES" -gt 0 ]; then
  printf '\n\033[31m%s failed check(s)\033[0m, %s warning(s).\n\n' "$FAILURES" "$WARNINGS"
  exit 1
fi

printf '\n\033[32mAll required checks passed.\033[0m %s warning(s).\n\n' "$WARNINGS"
