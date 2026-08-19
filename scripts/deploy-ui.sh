#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UI_DIR="${ROOT_DIR}/ui"

DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/projects/ts-swagger}"
RELEASE_KEEP="${RELEASE_KEEP:-5}"
VITE_PROXY_EXTENSION_URL="${VITE_PROXY_EXTENSION_URL:-/downloads/ts-swagger-extension-dist-latest.zip}"

log() {
  printf '[deploy-ui] %s\n' "$*"
}

fail() {
  printf '[deploy-ui] ERROR: %s\n' "$*" >&2
  exit 1
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "Missing required environment variable: ${name}"
  fi
}

require_cmd() {
  local name="$1"
  if ! command -v "${name}" >/dev/null 2>&1; then
    fail "Required command not found: ${name}"
  fi
}

case "${RELEASE_KEEP}" in
  ''|*[!0-9]*)
    fail "RELEASE_KEEP must be a positive integer"
    ;;
esac

if [[ "${RELEASE_KEEP}" -lt 1 ]]; then
  fail "RELEASE_KEEP must be at least 1"
fi

require_env DEPLOY_HOST
require_env DEPLOY_USER

require_cmd npm
require_cmd rsync
require_cmd ssh

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH_CONTROL_PATH="/tmp/ts-swagger-ssh-${UID:-user}-%C"
SSH_OPTS=(
  -p "${DEPLOY_PORT}"
  -o ControlMaster=auto
  -o ControlPersist=10m
  -o "ControlPath=${SSH_CONTROL_PATH}"
)
RSYNC_RSH="ssh -p ${DEPLOY_PORT} -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=${SSH_CONTROL_PATH}"
RELEASE_NAME="ui-$(date +%Y%m%d%H%M%S)"
REMOTE_RELEASES_DIR="${DEPLOY_ROOT}/releases"
REMOTE_RELEASE_DIR="${REMOTE_RELEASES_DIR}/${RELEASE_NAME}"

log "UI directory: ${UI_DIR}"

cd "${UI_DIR}"

if [[ "${SKIP_INSTALL:-}" == "1" ]]; then
  log "Skipping npm ci because SKIP_INSTALL=1"
else
  log "Installing UI dependencies"
  npm ci
fi

export PATH="${UI_DIR}/node_modules/.bin:${PATH}"
require_cmd sentry-cli

if [[ -z "${SENTRY_AUTH_TOKEN:-}" && -f "${ROOT_DIR}/.sentryclirc" ]]; then
  SENTRY_AUTH_TOKEN="$(awk -F= '$1 == "token" {gsub(/\r/, "", $2); print $2; exit}' "${ROOT_DIR}/.sentryclirc")"
  export SENTRY_AUTH_TOKEN
fi

require_env SENTRY_AUTH_TOKEN
export SENTRY_URL="${SENTRY_URL:-https://monitor.huzhibin.top}"
export SOURCEMAP_URL_PREFIX="${SOURCEMAP_URL_PREFIX:-https://swagger.huzhibin.top/assets/}"

log "Typechecking UI"
npm run typecheck

log "Building UI and uploading GlitchTip sourcemaps with legacy sentry-cli"
VITE_PROXY_EXTENSION_URL="${VITE_PROXY_EXTENSION_URL}" npm run build:glitchtip

[[ -f "${UI_DIR}/dist/index.html" ]] || fail "Build output missing: ui/dist/index.html"

log "Preparing remote release directory: ${REMOTE_RELEASE_DIR}"
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "mkdir -p '${REMOTE_RELEASE_DIR}'"

log "Uploading ui/dist to ${SSH_TARGET}:${REMOTE_RELEASE_DIR}/"
rsync -avz --delete -e "${RSYNC_RSH}" \
  "${UI_DIR}/dist/" \
  "${SSH_TARGET}:${REMOTE_RELEASE_DIR}/"

log "Activating release ${RELEASE_NAME}"
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "bash -s" -- \
  "${DEPLOY_ROOT}" \
  "${REMOTE_RELEASE_DIR}" \
  "${RELEASE_NAME}" \
  "${RELEASE_KEEP}" <<'REMOTE_SCRIPT'
set -euo pipefail

DEPLOY_ROOT="$1"
REMOTE_RELEASE_DIR="$2"
RELEASE_NAME="$3"
RELEASE_KEEP="$4"

RELEASES_DIR="${DEPLOY_ROOT}/releases"
DIST_PATH="${DEPLOY_ROOT}/dist"

if [[ ! -f "${REMOTE_RELEASE_DIR}/index.html" ]]; then
  echo "Release is missing index.html: ${REMOTE_RELEASE_DIR}" >&2
  exit 1
fi

mkdir -p "${RELEASES_DIR}"

CURRENT_DIST_SOURCE=""
if [[ -L "${DIST_PATH}" ]]; then
  CURRENT_DIST_SOURCE="$(readlink -f "${DIST_PATH}")"
elif [[ -d "${DIST_PATH}" ]]; then
  CURRENT_DIST_SOURCE="${DIST_PATH}"
fi

if [[ -n "${CURRENT_DIST_SOURCE}" && "${CURRENT_DIST_SOURCE}" != "${REMOTE_RELEASE_DIR}" ]]; then
  rsync -a --ignore-existing "${CURRENT_DIST_SOURCE}/" "${REMOTE_RELEASE_DIR}/"
fi

if [[ -e "${DIST_PATH}" && ! -L "${DIST_PATH}" ]]; then
  LEGACY_RELEASE="${RELEASES_DIR}/ui-legacy-$(date +%Y%m%d%H%M%S)"
  mv "${DIST_PATH}" "${LEGACY_RELEASE}"
fi

ln -sfn "${REMOTE_RELEASE_DIR}" "${DIST_PATH}.next"
mv -Tf "${DIST_PATH}.next" "${DIST_PATH}"

find "${RELEASES_DIR}" -maxdepth 1 -mindepth 1 -type d -name 'ui-*' \
  | sort -r \
  | tail -n +"$((RELEASE_KEEP + 1))" \
  | xargs -r rm -rf

echo "Activated ${RELEASE_NAME}"
REMOTE_SCRIPT

log "Running remote nginx config test"
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "nginx -t"

log "Done. Active dist points to ${REMOTE_RELEASE_DIR}"
