#!/usr/bin/env bash
#
# First-time production setup on Amazon Linux 2023.
#
# Run once, on the server, from the repository root:
#
#   cd /var/www/aptentech/aptentech-platform
#   bash deploy/first-time-setup.sh
#
# Idempotent: every step checks whether it has already been done, so re-running after a
# failure part way through picks up rather than duplicating work.
#
# It does NOT create the admin account or clear the demo content — both need a decision from
# you, and both are printed at the end.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- 1. swap
#
# t3.micro has 1 GB of RAM and the Next.js build needs roughly 2 GB. Without swap the kernel
# kills the build part way through, and the error it prints does not mention memory — so this
# is the first thing set up, not an afterthought.

if ! swapon --show | grep -q swapfile; then
  say "Creating 2 GB swap (the build needs more RAM than this instance has)"
  sudo dd if=/dev/zero of=/swapfile bs=128M count=16 status=none
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  say "Swap already present"
fi
free -h

# ---------------------------------------------------------------- 2. packages

say "Installing Node.js 20 and nginx"
sudo dnf install -y nodejs20 nodejs20-npm nginx git tar >/dev/null

# Amazon Linux installs these namespaced as node-20 / npm-20; link them so every later
# command — and the systemd units — can just say `node`.
if [ ! -e /usr/bin/node ]; then
  sudo alternatives --install /usr/bin/node node /usr/bin/node-20 90
fi
if [ ! -e /usr/bin/npm ]; then
  sudo alternatives --install /usr/bin/npm npm /usr/bin/npm-20 90
fi

node --version
npm --version

# ---------------------------------------------------------------- 3. dependencies

say "Installing dependencies"
npm ci

# ---------------------------------------------------------------- 4. environment

if [ ! -f apps/api/.env ]; then
  echo "apps/api/.env is missing. Create it first — see docs/SERVER-SETUP.md step 7." >&2
  exit 1
fi

# The two apps authenticate to each other with a shared token. Copying rather than asking you
# to keep them in sync is the whole point: a mismatch renders every page empty with no error.
say "Copying the API environment to the web app"
cp apps/api/.env apps/web/.env.local

# ---------------------------------------------------------------- 5. build

say "Building the shared package and the API"
npm run build --workspace @aptentech/shared
npm run build --workspace @aptentech/api

# The web build reads content and the redirect table from the API over HTTP, so the API has to
# be answering before it starts.
say "Starting the API so the site can be built against it"
node apps/api/dist/server.js &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 20); do
  if curl -sf -o /dev/null http://127.0.0.1:4000/health; then break; fi
  sleep 2
done

if ! curl -sf -o /dev/null http://127.0.0.1:4000/health; then
  echo "The API did not come up. Check apps/api/.env — MONGODB_URI is the usual cause." >&2
  exit 1
fi

say "Loading content from the original HTML"
export SOURCE_HTML_DIR="${SOURCE_HTML_DIR:-/var/www/aptentech}"
npm run seed

say "Building the website"
npm run build --workspace @aptentech/web

kill "$API_PID" 2>/dev/null || true
trap - EXIT
sleep 2

# ---------------------------------------------------------------- 6. services

say "Installing the systemd units"
sudo cp deploy/aptentech-api.service deploy/aptentech-web.service deploy/aptentech.target /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable aptentech-api aptentech-web aptentech.target >/dev/null
sudo systemctl restart aptentech.target

for _ in $(seq 1 20); do
  if curl -sf -o /dev/null http://127.0.0.1:3000/; then break; fi
  sleep 2
done

# ---------------------------------------------------------------- 7. nginx

say "Configuring nginx"
sudo cp deploy/nginx.conf /etc/nginx/conf.d/aptentech.conf
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

# ---------------------------------------------------------------- done

printf '\n\033[1mAPI \033[0m %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/health)"
printf '\033[1mWeb \033[0m %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)"
printf '\033[1mnginx\033[0m %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)"

cat <<'NEXT'

Setup complete. Two things still need a decision from you:

  1. Create the admin account — the password prints once and cannot be read back:
       npm run create-admin -- --email you@aptentech.com --name "Your Name" --role SUPER_ADMIN

  2. Hide the demo awards, testimonials and case-study metrics. None is publishable: they are
     claims about the company that nobody verified, and a visitor cannot tell them from real
     ones. This hides rather than deletes, so it is reversible from the CMS.
       npm run clear-demo -- --apply

  Then set the real company email and phone in the admin under Settings, and check:
       npm run preflight

Controlling the site from here on — one command each:

  sudo systemctl restart aptentech.target
  sudo systemctl status  aptentech.target
  journalctl -u aptentech-api -u aptentech-web -f

NEXT
