#!/usr/bin/env bash
#
# What the CI job runs on the server.
#
#   bash scripts/ci-deploy.sh [ref]
#
# Fetches the requested ref, makes the working tree match it exactly, and redeploys. Run by
# hand for the same effect as a push.
#
# It is deliberately a file in the repository rather than a script typed into the CI workflow:
# the deploy steps are reviewed and versioned with the code they deploy, and the workflow stays
# a single line that anyone can read.

set -euo pipefail

REF="${1:-main}"
ROOT="${CI_DEPLOY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# ---------------------------------------------------------------- run from a copy
#
# `git reset --hard` below rewrites this very file, and bash reads a script incrementally by
# byte offset rather than loading it whole — so a script that changes underneath itself carries
# on executing at the old offset into new bytes. The failure is arbitrary: a truncated command,
# a syntax error from the middle of a comment, or worse, half of a command that still runs.
#
# Copying to /tmp and re-executing from there means git can rewrite the original freely. ROOT is
# passed across because the copy can no longer work out where it came from.
if [ "${CI_DEPLOY_DETACHED:-}" != "1" ]; then
  COPY="$(mktemp /tmp/ci-deploy.XXXXXXXX.sh)"
  cp "${BASH_SOURCE[0]}" "$COPY"
  CI_DEPLOY_DETACHED=1 CI_DEPLOY_ROOT="$ROOT" bash "$COPY" "$@"
  status=$?
  rm -f "$COPY"
  exit "$status"
fi

cd "$ROOT"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# A step that failed without being fatal. Loud on purpose: the alternative is `|| true`,
# which hides the failure completely and leaves someone comparing a live page against a
# payload to work out that a script never ran.
warn() { printf '\n\033[1;33m!!! %s\033[0m\n' "$*" >&2; }

# ---------------------------------------------------------------- one at a time
#
# Two pushes a minute apart would otherwise run two builds over the same working tree, and the
# second would be compiling files the first is still rewriting. `flock` makes the second wait.
# The CI workflow also serialises its own runs; this covers a manual run racing an automatic one.

if command -v flock >/dev/null 2>&1; then
  exec 9>/tmp/aptentech-deploy.lock
  if ! flock -w 1800 9; then
    echo "Another deploy has held the lock for 30 minutes. Check: pm2 logs aptentech-web" >&2
    exit 1
  fi
else
  # Amazon Linux ships flock with util-linux, so this branch means an unusual host. Say what is
  # missing rather than reporting a lock timeout that never happened — serialising is a
  # safeguard, not a requirement, and failing the deploy over it would be worse than the race.
  echo "warning: flock is not installed, so concurrent deploys are not serialised here." >&2
fi

# ---------------------------------------------------------------- 1. code

say "Fetching $REF"
git fetch --prune origin "$REF"

# `reset --hard` rather than `pull`: the deploy must land on exactly what was merged, and a
# local edit made by hand on the server should not be able to block it or survive it silently.
# Untracked files are left alone, which is what keeps apps/api/.env and node_modules in place.
git reset --hard "origin/$REF"

say "Now at $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# ---------------------------------------------------------------- 2. data shape
#
# Schema migrations run before the build, because the build reads content through the API and
# a document in the old shape fails to render. Each script is idempotent and reports "0" when
# there is nothing to do, so listing them here costs nothing on a normal deploy.

# Mail settings, so nobody edits .env by hand. The host, port and mailbox address are in the
# script; the password arrives as an environment variable from a GitHub Actions secret and is
# never written into the repository.
say "Applying mail settings"
node scripts/apply-mail-env.js || true

say "Checking data migrations"
node scripts/migrate-tech-stack.js --apply
node scripts/migrate-home-growth.js --apply
node scripts/migrate-lead-attachments.js --apply

# Approved page copy, from scripts/data. Unlike the migrations above, these assert that a
# page equals a payload in the repository — an assertion that stops being true the moment an
# admin edits the page. So they are guarded by a hash of the payload file: a payload applies
# when it has changed since it was last written, and a deploy that carries no new copy leaves
# the CMS alone. Without that guard this would revert every admin edit made since the last
# release, which from the admin's side looks like the CMS losing their work.
#
# Not fatal: a payload that fails to apply is a page showing its previous wording, which is
# not a reason to abandon a deploy that has already been built. But not silent either — the
# first time one of these failed under `|| true`, the only evidence was a page that had not
# changed, and working out which of the two scripts had not run took longer than the fix.
say "Applying approved page copy"
node scripts/apply-home-content.js --apply || warn "home page copy did NOT apply — error above"
node scripts/apply-service-content.js --apply || warn "service page copy did NOT apply — error above"

# Deletes attachment files no enquiry claims. Not a migration — it runs every deploy because
# abandoned uploads accumulate continuously, and a deploy is the one moment that reliably
# happens without anyone having to remember it. It only ever removes files the database does
# not know about, and refuses outright if the database looks empty.
say "Sweeping unclaimed attachments"
node scripts/sweep-lead-attachments.js --apply || true

# ---------------------------------------------------------------- 3. deploy

say "Deploying"
bash scripts/deploy-prod.sh
