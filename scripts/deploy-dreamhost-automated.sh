#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 || $# -gt 7 ]]; then
  cat <<USAGE
Usage:
  $0 <dreamhost_user@host> <remote_web_root> <remote_app_dir> <github_repo_url> [branch] [public_ip] [host_header]

Examples:
  $0 parkertheemmerson@vps68725.dreamhostps.com ~/adaywithoutabillionaire.net ~/apps/social-archive https://github.com/OWNER/REPO.git
  $0 parkertheemmerson@vps68725.dreamhostps.com ~/adaywithoutabillionaire.net ~/apps/social-archive https://github.com/OWNER/REPO.git main 69.163.205.13 adaywithoutabillionaire.net
USAGE
  exit 1
fi

REMOTE="$1"
REMOTE_WEB_ROOT="$2"
REMOTE_APP_DIR="$3"
GITHUB_REPO_URL="$4"
BRANCH="${5:-main}"
PUBLIC_IP="${6:-}"
HOST_HEADER="${7:-}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -p 22)

run_ssh() {
  ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"
}

# 1) Ensure app source exists on DreamHost and is up-to-date with GitHub
run_ssh "mkdir -p '${REMOTE_APP_DIR}'"
if run_ssh "test -d '${REMOTE_APP_DIR}/.git'"; then
  run_ssh "cd '${REMOTE_APP_DIR}' && git remote set-url origin '${GITHUB_REPO_URL}' && git fetch --all --prune && git checkout '${BRANCH}' && git pull --ff-only origin '${BRANCH}'"
else
  run_ssh "rm -rf '${REMOTE_APP_DIR}' && git clone --branch '${BRANCH}' '${GITHUB_REPO_URL}' '${REMOTE_APP_DIR}'"
fi

# 2) Build on DreamHost and publish dist/ to web root
run_ssh "cd '${REMOTE_APP_DIR}' && npm ci && npm run build"
run_ssh "mkdir -p '${REMOTE_WEB_ROOT}'"
run_ssh "rsync -av --delete '${REMOTE_APP_DIR}/dist/' '${REMOTE_WEB_ROOT}/'"
run_ssh "if [ -f '${REMOTE_APP_DIR}/deploy/dreamhost/.htaccess' ]; then cp '${REMOTE_APP_DIR}/deploy/dreamhost/.htaccess' '${REMOTE_WEB_ROOT}/.htaccess'; fi"

# 3) Install a remote helper so you can edit directly on DreamHost then republish quickly
run_ssh "cat > '${REMOTE_APP_DIR}/publish-on-dreamhost.sh' <<'SCRIPT'\n#!/usr/bin/env bash\nset -euo pipefail\nAPP_DIR='${REMOTE_APP_DIR}'\nWEB_ROOT='${REMOTE_WEB_ROOT}'\ncd \"$APP_DIR\"\nnpm ci\nnpm run build\nrsync -av --delete dist/ \"$WEB_ROOT/\"\nif [ -f deploy/dreamhost/.htaccess ]; then cp deploy/dreamhost/.htaccess \"$WEB_ROOT/.htaccess\"; fi\necho \"Published from $APP_DIR to $WEB_ROOT\"\nSCRIPT\nchmod +x '${REMOTE_APP_DIR}/publish-on-dreamhost.sh'"

# 4) Optional verification by IP
if [[ -n "$PUBLIC_IP" ]]; then
  if [[ -n "$HOST_HEADER" ]]; then
    curl -fsS --max-time 30 -H "Host: ${HOST_HEADER}" "http://${PUBLIC_IP}/" >/dev/null
    curl -fsS --max-time 30 -H "Host: ${HOST_HEADER}" "http://${PUBLIC_IP}/archives/test-route" >/dev/null
  else
    curl -fsS --max-time 30 "http://${PUBLIC_IP}/" >/dev/null
    curl -fsS --max-time 30 "http://${PUBLIC_IP}/archives/test-route" >/dev/null
  fi
  echo "Deploy complete and verified: http://${PUBLIC_IP}/"
else
  echo "Deploy complete. (Skipped HTTP verification because no public_ip was provided.)"
fi

echo "Remote source directory (editable): ${REMOTE_APP_DIR}"
echo "Remote publish helper: ${REMOTE_APP_DIR}/publish-on-dreamhost.sh"
