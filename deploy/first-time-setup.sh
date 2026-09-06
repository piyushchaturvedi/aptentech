#!/usr/bin/env bash
#
# SUPERSEDED — do not run this.
#
# This script installed the two apps as systemd units. Deployment now runs them under PM2, and
# having both supervisors installed means both start at boot and race for ports 3000 and 4000:
# one wins, the other dies with EADDRINUSE, and which one won is not obvious afterwards.
#
# Use instead, for the first deploy and every one after it:
#
#   SITE_URL=http://your-server-ip npm run deploy:prod
#
# If the systemd units were already installed by an earlier run, `npm run deploy:prod` disables
# them for you. This file and deploy/aptentech-*.service are safe to delete.

echo "This script is superseded. Run instead:" >&2
echo >&2
echo "  SITE_URL=http://your-server-ip npm run deploy:prod" >&2
echo >&2
exit 1
