#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "Usage: $0 <dreamhost_user@host> <remote_web_root> <public_ip> [host_header]"
  echo "Example: $0 user@iad1-shared-a1-00.dreamhost.com ~/example.com 198.51.100.10"
  echo "Example: $0 user@iad1-shared-a1-00.dreamhost.com ~/example.com 198.51.100.10 example.com"
  exit 1
fi

REMOTE="$1"
REMOTE_ROOT="$2"
PUBLIC_IP="$3"
HOST_HEADER="${4:-}"

if [[ ! -d dist ]]; then
  echo "dist/ not found. Building now..."
  npm run build
fi

# Sync built assets
rsync -avz --delete dist/ "${REMOTE}:${REMOTE_ROOT}/"

# Ensure SPA fallback config is present
scp deploy/dreamhost/.htaccess "${REMOTE}:${REMOTE_ROOT}/.htaccess"

# Verify index page over IP
if [[ -n "$HOST_HEADER" ]]; then
  curl -fsS --max-time 20 -H "Host: ${HOST_HEADER}" "http://${PUBLIC_IP}/" >/dev/null
  curl -fsS --max-time 20 -H "Host: ${HOST_HEADER}" "http://${PUBLIC_IP}/archives/test-route" >/dev/null
else
  curl -fsS --max-time 20 "http://${PUBLIC_IP}/" >/dev/null
  curl -fsS --max-time 20 "http://${PUBLIC_IP}/archives/test-route" >/dev/null
fi

echo "Deployment complete and verified at: http://${PUBLIC_IP}/"
