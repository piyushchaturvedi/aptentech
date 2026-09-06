#!/usr/bin/env bash
#
# Redeploy after a code change.
#
#   cd /var/www/aptentech/aptentech-platform
#   bash deploy/redeploy.sh
#
# Content edited in the CMS reaches the live site on its own — only a code change needs this.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "Installing dependencies"
npm ci

say "Building the shared package and the API"
npm run build --workspace @aptentech/shared
npm run build --workspace @aptentech/api

# The API restarts first because the web build reads its content over HTTP. Building against
# the old API would bake the old content into the new pages.
say "Restarting the API"
sudo systemctl restart aptentech-api

for _ in $(seq 1 20); do
  if curl -sf -o /dev/null http://127.0.0.1:4000/health; then break; fi
  sleep 2
done

if ! curl -sf -o /dev/null http://127.0.0.1:4000/health; then
  echo "The API did not come back up — the site is still serving the previous build." >&2
  echo "  journalctl -u aptentech-api -n 50 --no-pager" >&2
  exit 1
fi

say "Building the website"
npm run build --workspace @aptentech/web

say "Restarting the website"
sudo systemctl restart aptentech-web

for _ in $(seq 1 20); do
  if curl -sf -o /dev/null http://127.0.0.1:3000/; then break; fi
  sleep 2
done

printf '\n\033[1mAPI \033[0m %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/health)"
printf '\033[1mWeb \033[0m %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)"
