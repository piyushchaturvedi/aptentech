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

# --include=dev is not optional here, and it is the one that bites. NODE_ENV=production — which
# this deploy sets — makes npm omit devDependencies by default, and the build toolchain lives
# there: typescript for the shared package and the API, next for the site. Without it the
# install "succeeds" and the very next step dies with `tsc: command not found`.
#
# The presence of node_modules is not evidence the toolchain works, so the test is to run the
# compiler rather than to look for its file. Two ways a directory that looks complete is not:
# an install run with NODE_ENV=production already set omitted every devDependency, and a tree
# uploaded from a Windows machine carries Windows binaries — esbuild, next-swc and the .bin
# shims are all platform-specific and none of them run here.
if ! node_modules/.bin/tsc --version >/dev/null 2>&1   || ! [ -d node_modules/next ]   || [ package-lock.json -nt node_modules ]; then
  # A tree from another platform cannot be repaired in place; npm sees the packages as present
  # and leaves the wrong binaries alone. It has to go.
  rm -rf node_modules apps/*/node_modules packages/*/node_modules
  npm ci --include=dev
  ok "installed"
else
  ok "up to date"
fi

node_modules/.bin/tsc --version >/dev/null 2>&1   || die "The TypeScript compiler still will not run. Try: rm -rf node_modules && npm ci --include=dev"

# PM2 goes in globally, which writes into the Node installation and therefore needs root. It is
# deliberately not a devDependency: the systemd unit that restarts the site at boot holds an
# absolute path to this binary, and a redeploy that rebuilds node_modules would leave that unit
# pointing at a file that no longer exists.
#
# `sudo npm` on its own usually fails here — root's PATH does not include the nodejs20 install,
# so npm is not found even though it works for you. Carry the PATH across and call npm by its
# full path.
if ! command -v pm2 >/dev/null 2>&1; then
  sudo env PATH="$PATH" "$(command -v npm)" install -g pm2 >/dev/null     || die "Could not install pm2. Run: sudo env PATH=$PATH $(command -v npm) install -g pm2"
  ok "installed pm2"
fi

# Installing it is not the same as being able to run it. Amazon Linux's nodejs20 package uses
# /usr/lib/nodejs20 as its npm prefix, and that prefix's bin directory is not on anyone's PATH —
# so the install reports success and `pm2` is still "command not found". Link the package's own
# entry script, which is where it reliably is, rather than trusting the prefix bin directory.
if ! command -v pm2 >/dev/null 2>&1; then
  PM2_BIN="$(npm prefix -g 2>/dev/null)/lib/node_modules/pm2/bin/pm2"
  [ -f "$PM2_BIN" ] || PM2_BIN=/usr/lib/nodejs20/lib/node_modules/pm2/bin/pm2
  if [ -f "$PM2_BIN" ]; then
    sudo ln -sf "$PM2_BIN" /usr/bin/pm2
    ok "linked pm2 into /usr/bin"
  fi
fi

command -v pm2 >/dev/null 2>&1 || die "pm2 is installed but will not run. Find it with:
       sudo find / -name pm2 -type f -path '*/bin/*' 2>/dev/null
     then link it:
       sudo ln -sf <that path> /usr/bin/pm2"

# ---------------------------------------------------------------- 3. directories

step "Preparing directories"
# Outside the code tree, so a redeploy that replaces the tree cannot delete uploaded media.
sudo mkdir -p "$UPLOAD_DIR"
sudo chown -R "$(id -u):$(id -g)" "$UPLOAD_DIR"
ok "media: $UPLOAD_DIR"

# ---------------------------------------------------------------- 4. build headroom

step "Checking build memory"

# Two different limits, and fixing only one of them leaves the build failing the same way.
#
# The first is the machine: a t3.micro has 1 GB, compiling this project needs more, and the
# kernel kills the compiler part-way with an error that never says "out of memory".
#
# The second is V8's own heap ceiling, which it picks from how much RAM it sees — on 1 GB that
# lands near 460 MB, and V8 will not grow past its own ceiling however much swap exists. That is
# why swap alone does not fix "JavaScript heap out of memory": the swap gives the machine room,
# and --max-old-space-size is what lets the compiler actually use it.

MEM_MB="$(free -m | awk '/^Mem:/{print $2}')"
SWAP_MB="$(free -m | awk '/^Swap:/{print $2}')"

if [ "$SWAP_MB" -lt 1024 ] && [ "$MEM_MB" -lt 2048 ]; then
  warn "only ${MEM_MB}MB RAM and ${SWAP_MB}MB swap — adding a 2GB swapfile"
  sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  # Survives a reboot. Appended only once, however often this script is re-run.
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  SWAP_MB="$(free -m | awk '/^Swap:/{print $2}')"
  ok "swap: ${SWAP_MB}MB"
fi

# Leave roughly a quarter of the machine for everything that is not the compiler — mongod,
# nginx, and the API that is about to start.
#
# Written as if/fi rather than `[ test ] && VAR=x`: under `set -e` that one-liner form aborts
# the whole script whenever the test is false, because the AND-list itself then exits non-zero.
HEAP_MB=$(( (MEM_MB + SWAP_MB) * 3 / 4 ))
if [ "$HEAP_MB" -gt 4096 ]; then HEAP_MB=4096; fi
if [ "$HEAP_MB" -lt 2048 ]; then HEAP_MB=2048; fi
export NODE_OPTIONS="--max-old-space-size=$HEAP_MB ${NODE_OPTIONS:-}"
ok "compiler heap: ${HEAP_MB}MB (${MEM_MB}MB RAM + ${SWAP_MB}MB swap)"

# ---------------------------------------------------------------- 5. shared + API build

step "Building the shared package and the API"
npm run build --workspace @aptentech/shared >/dev/null
npm run build --workspace @aptentech/api >/dev/null
ok "built"

# ---------------------------------------------------------------- 6. API up first

step "Starting the API"

# PM2 is the only supervisor. An earlier revision of this repository also shipped systemd units
# for the same two processes; if those are still installed, both supervisors start on boot and
# race for ports 3000 and 4000 — one wins, the other dies with EADDRINUSE, and which one won is
# not obvious afterwards. Hand ownership over cleanly.
for unit in aptentech.target aptentech-api aptentech-web; do
  # is-enabled fails on a unit that was never installed, which is the common case.
  if systemctl is-enabled "$unit" >/dev/null 2>&1; then
    sudo systemctl disable --now "$unit" >/dev/null 2>&1 || true
    warn "disabled the old systemd unit $unit — PM2 supervises these now"
  fi
done

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

# ---------------------------------------------------------------- 7. database

step "Checking MongoDB"
node scripts/check-db.js || die "MongoDB is not usable — see above."

# A database that is running now but not enabled at boot is the quietest way to lose the site
# on the next reboot: PM2 comes back, both processes come back, and every page renders empty.
# Only meaningful when mongod is this machine's own service — a managed cluster has no unit.
if systemctl list-unit-files mongod.service >/dev/null 2>&1; then
  if systemctl is-enabled mongod >/dev/null 2>&1; then
    ok "mongod starts at boot"
  else
    sudo systemctl enable mongod >/dev/null 2>&1 \
      && ok "enabled mongod at boot" \
      || warn "mongod is not enabled at boot — run: sudo systemctl enable mongod"
  fi
fi

# ---------------------------------------------------------------- 8. website build

step "Building the website"
npm run build --workspace @aptentech/web >/dev/null
ok "built"

# ---------------------------------------------------------------- 9. website up

step "Starting the website"
pm2 startOrReload deploy/ecosystem.config.js --only aptentech-web --update-env >/dev/null

for _ in $(seq 1 25); do
  curl -sf -o /dev/null http://127.0.0.1:3000/ && break
  sleep 2
done
curl -sf -o /dev/null http://127.0.0.1:3000/ \
  || die "The website did not start. Run: pm2 logs aptentech-web --lines 50"
ok "website healthy on :3000"

# ---------------------------------------------------------------- 10. persist PM2

step "Saving the PM2 process list"
# Three separate things have to be true for the site to stay up, and they fail independently:
#
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

# ---------------------------------------------------------------- 11. nginx

step "Configuring nginx"
if ! command -v nginx >/dev/null 2>&1; then
  sudo dnf install -y nginx >/dev/null
fi
sudo cp deploy/nginx.conf /etc/nginx/conf.d/aptentech.conf
sudo nginx -t >/dev/null 2>&1 || die "nginx rejected the configuration: sudo nginx -t"
sudo systemctl enable nginx >/dev/null 2>&1 || true
sudo systemctl reload nginx 2>/dev/null || sudo systemctl start nginx
ok "nginx reloaded"

# ---------------------------------------------------------------- 12. verify

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
