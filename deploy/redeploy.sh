#!/usr/bin/env bash
#
# SUPERSEDED — do not run this.
#
# This script restarted the apps through systemd. They run under PM2 now, so `systemctl restart
# aptentech-api` either fails or starts a second copy of a process PM2 is already supervising.
#
# Redeploy after a code change with the same command as the first deploy — it is safe to re-run
# and touches no data:
#
#   npm run deploy:prod

echo "This script is superseded. Run instead:" >&2
echo >&2
echo "  npm run deploy:prod" >&2
echo >&2
exit 1
