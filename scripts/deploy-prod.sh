#!/usr/bin/env bash
#
# The only command needed to deploy.
#
#   npm run deploy:prod
#
# Safe to re-run: it configures, builds, restarts and verifies, and it never touches existing
# data — no drop, no delete, and the content seed runs only when the database is empty.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STEP=0
step() { STEP=$((STEP + 1)); printf '\n\033[1m[%2d] %s\033[0m\n' "$STEP" "$*"; }
ok()   { printf '     \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '     \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

SITE_URL="${SITE_URL:-}"

# ---------------------------------------------------------------- 1. environment

step "Validating the production environment"
# Configures everything derivable and generates any missing secret. It exits non-zero, naming
# the variable, if something can only come from you.
SITE_URL="$SITE_URL" node scripts/prod-env.js || die "Production environment is incomplete — see above."

# Read back only what this script needs to address the services. No secret is read here.
SITE_URL="$(grep -E '^PUBLIC_SITE_URL=' apps/api/.env | cut -d= -f2-)"
UPLOAD_DIR="$(grep -E '^LOCAL_UPLOAD_DIR=' apps/api/.env | cut -d= -f2-)"

# ---------------------------------------------------------------- 2. dependencies

step "Installing dependencies"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  npm ci
  ok "installed"
else
  ok "up to date"
fi

command -v pm2 >/dev/null 2>&1 || { npm install -g pm2 >/dev/null; ok "installed pm2"; }

# ---------------------------------------------------------------- 3. directories

step "Preparing directories"
# Outside the code tree, so a redeploy that replaces the tree cannot delete uploaded media.
sudo mkdir -p "$UPLOAD_DIR"
sudo chown -R "$(id -u):$(id -g)" "$UPLOAD_DIR"
ok "media: $UPLOAD_DIR"

# ---------------------------------------------------------------- 4. shared + API build

step "Building the shared package and the API"
npm run build --workspace @aptentech/shared >/dev/null
npm run build --workspace @aptentech/api >/dev/null
ok "built"

# ---------------------------------------------------------------- 5. API up first

step "Starting the API"
# Before the web build, which reads its content and redirect table from the API over HTTP.
# Building against a stopped API silently ships the compiled-in fallbacks instead.
pm2 startOrReload deploy/ecosystem.config.js --only aptentech-api --update-env >/dev/null

for _ in $(seq 1 25); do
  curl -sf -o /dev/null http://127.0.0.1:4000/health && break
  sleep 2
done
curl -sf -o /dev/null http://127.0.0.1:4000/health \
  || die "The API did not start. Run: pm2 logs aptentech-api --lines 50"
ok "API healthy on :4000"

# ---------------------------------------------------------------- 6. database

step "Checking MongoDB"
node scripts/check-db.js || die "MongoDB is not usable — see above."

# ---------------------------------------------------------------- 7. website build

step "Building the website"
npm run build --workspace @aptentech/web >/dev/null
ok "built"

# ---------------------------------------------------------------- 8. website up

step "Starting the website"
pm2 startOrReload deploy/ecosystem.config.js --only aptentech-web --update-env >/dev/null

for _ in $(seq 1 25); do
  curl -sf -o /dev/null http://127.0.0.1:3000/ && break
  sleep 2
done
curl -sf -o /dev/null http://127.0.0.1:3000/ \
  || die "The website did not start. Run: pm2 logs aptentech-web --lines 50"
ok "website healthy on :3000"

# ---------------------------------------------------------------- 9. persist PM2

step "Saving the PM2 process list"
/*
  Three separate things have to be true for the site to stay up, and they fail independently.
*/

# 1. Surviving the terminal closing — PM2 runs the processes under its own daemon, which is
#    already true by this point.
# 2. Surviving a crash — `autorestart` in the ecosystem file.
# 3. Surviving a reboot — the two steps below, and this is the one that is easy to get wrong.

# `pm2 startup` WITHOUT sudo only prints the command to run; it installs nothing. Run under
# sudo it actually writes /etc/systemd/system/pm2-<user>.service and enables it, which is what
# makes systemd bring PM2 back at boot.
sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME" >/dev/null 2>&1 || true

# The dump systemd's unit resurrects. Written after the processes are running, so it records
# both of them.
pm2 save >/dev/null

if systemctl is-enabled "pm2-$USER" >/dev/null 2>&1; then
  ok "will restart after a reboot (pm2-$USER.service enabled)"
else
  warn "boot persistence is NOT set up — the site will not come back after a reboot."
  warn "run once:  sudo env PATH=\$PATH \$(command -v pm2) startup systemd -u $USER --hp $HOME"
fi

# ---------------------------------------------------------------- 10. nginx

step "Configuring nginx"
if ! command -v nginx >/dev/null 2>&1; then
  sudo dnf install -y nginx >/dev/null
fi
sudo cp deploy/nginx.conf /etc/nginx/conf.d/aptentech.conf
sudo nginx -t >/dev/null 2>&1 || die "nginx rejected the configuration: sudo nginx -t"
sudo systemctl enable nginx >/dev/null 2>&1 || true
sudo systemctl reload nginx 2>/dev/null || sudo systemctl start nginx
ok "nginx reloaded"

# ---------------------------------------------------------------- 11. verify

step "Verifying through nginx"

check() {
  local label="$1" path="$2" expect="${3:-200}"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://127.0.0.1${path}")"
  if [ "$code" = "$expect" ]; then ok "$label — $code"; else warn "$label — $code (expected $expect)"; FAILED=1; fi
}

FAILED=0
check "website          " "/"
check "admin            " "/admin/" 200
check "API health       " "/api/health"
check "sitemap          " "/sitemap.xml"
check "lead endpoint    " "/api/leads/" 405

[ "$FAILED" = "0" ] || warn "Something above did not respond as expected — check pm2 logs."

# ---------------------------------------------------------------- done

cat <<EOF

$(printf '\033[1m─%.0s\033[0m' $(seq 1 62))

  Website   ${SITE_URL}/
  Admin     ${SITE_URL}/admin
  API       ${SITE_URL}/api/health

  pm2 status          both processes
  pm2 logs            follow both
  npm run preflight   what still blocks a public launch

EOF
