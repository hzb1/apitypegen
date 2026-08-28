#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXTENSION_DIR="${ROOT_DIR}/extension"
RELEASE_DIR="${EXTENSION_DIR}/release"

DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/projects/ts-swagger/downloads}"

log() {
  printf '[deploy-extension] %s\n' "$*"
}

fail() {
  printf '[deploy-extension] ERROR: %s\n' "$*" >&2
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

require_env DEPLOY_HOST
require_env DEPLOY_USER

require_cmd npm
require_cmd node
require_cmd zip
require_cmd rsync
require_cmd ssh

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH_CONTROL_PATH="/tmp/apitypegen-ssh-${UID:-user}-%C"
SSH_OPTS=(
  -p "${DEPLOY_PORT}"
  -o ControlMaster=auto
  -o ControlPersist=10m
  -o "ControlPath=${SSH_CONTROL_PATH}"
)
RSYNC_RSH="ssh -p ${DEPLOY_PORT} -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=${SSH_CONTROL_PATH}"

log "Extension directory: ${EXTENSION_DIR}"

cd "${EXTENSION_DIR}"

if [[ "${SKIP_INSTALL:-}" == "1" ]]; then
  log "Skipping npm ci because SKIP_INSTALL=1"
else
  log "Installing extension dependencies"
  (cd "${ROOT_DIR}" && npm ci --workspace=@apitypegen/extension)
fi

log "Verifying extension version"
npm run verify:version

log "Building extension"
npm run build

[[ -f "${EXTENSION_DIR}/dist/manifest.json" ]] || fail "Build output missing: extension/dist/manifest.json"

VERSION="$(node -p "require('./package.json').version")"
[[ -n "${VERSION}" ]] || fail "Unable to read extension version"

ZIP_NAME="apitypegen-extension-dist-${VERSION}.zip"
LATEST_NAME="apitypegen-extension-dist-latest.zip"

rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"

log "Packaging ${ZIP_NAME}"
(
  cd "${EXTENSION_DIR}/dist"
  zip -qr "${RELEASE_DIR}/${ZIP_NAME}" .
)
cp "${RELEASE_DIR}/${ZIP_NAME}" "${RELEASE_DIR}/${LATEST_NAME}"

log "Ensuring remote directory: ${DEPLOY_PATH}"
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "mkdir -p '${DEPLOY_PATH}'"

log "Uploading extension packages to ${SSH_TARGET}:${DEPLOY_PATH}/"
rsync -avz -e "${RSYNC_RSH}" \
  "${RELEASE_DIR}/${ZIP_NAME}" \
  "${RELEASE_DIR}/${LATEST_NAME}" \
  "${SSH_TARGET}:${DEPLOY_PATH}/"

log "Running remote nginx config test"
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "nginx -t"

log "Done. Uploaded:"
log "  ${DEPLOY_PATH}/${ZIP_NAME}"
log "  ${DEPLOY_PATH}/${LATEST_NAME}"
