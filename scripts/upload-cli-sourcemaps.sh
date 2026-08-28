#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/cli/dist"
SENTRY_CLI="${ROOT_DIR}/node_modules/.bin/sentry-cli"

if [[ -f "${ROOT_DIR}/.env.glitchtip.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env.glitchtip.local"
  set +a
fi

CLI_VERSION="$(node -p "require('${ROOT_DIR}/cli/package.json').version")"
RELEASE_NAME="apitypegen@${CLI_VERSION}"
ORGANIZATION="${CLI_SENTRY_ORG:-ts-swagger}"
PROJECT="${CLI_SENTRY_PROJECT:-cli}"
URL_PREFIX="${CLI_SOURCEMAP_URL_PREFIX:-app:///dist}"
BATCH_FILE_COUNT="${CLI_SOURCEMAP_BATCH_FILE_COUNT:-8}"

fail() {
  printf '[cli-sourcemaps] ERROR: %s\n' "$*" >&2
  exit 1
}

case "${BATCH_FILE_COUNT}" in
  ''|*[!0-9]*)
    fail "CLI_SOURCEMAP_BATCH_FILE_COUNT must be a positive integer"
    ;;
esac

if [[ "${BATCH_FILE_COUNT}" -lt 1 ]]; then
  fail "CLI_SOURCEMAP_BATCH_FILE_COUNT must be at least 1"
fi

[[ -d "${DIST_DIR}" ]] || fail "Build directory not found: ${DIST_DIR}"
[[ -x "${SENTRY_CLI}" ]] || fail "sentry-cli is not available; run npm install"
[[ -n "${SENTRY_URL:-}" ]] || fail "SENTRY_URL is required"
[[ -n "${SENTRY_AUTH_TOKEN:-}" ]] || fail "SENTRY_AUTH_TOKEN is required"

files=()
while IFS= read -r -d '' file; do
  files+=("${file#./}")
done < <(cd "${DIST_DIR}" && find . -type f \( -name '*.js' -o -name '*.js.map' \) -print0)

[[ "${#files[@]}" -gt 0 ]] || fail "No JavaScript or sourcemap files found in ${DIST_DIR}"

cd "${DIST_DIR}"
total_files="${#files[@]}"
batch_number=0

for ((batch_start = 0; batch_start < total_files; batch_start += BATCH_FILE_COUNT)); do
  batch_number=$((batch_number + 1))
  batch=("${files[@]:batch_start:BATCH_FILE_COUNT}")
  batch_end=$((batch_start + ${#batch[@]}))

  printf '[cli-sourcemaps] Uploading batch %d: files %d-%d of %d\n' \
    "${batch_number}" "$((batch_start + 1))" "${batch_end}" "${total_files}"

  SENTRY_URL="${SENTRY_URL}" "${SENTRY_CLI}" releases \
    --org "${ORGANIZATION}" \
    --project "${PROJECT}" \
    files "${RELEASE_NAME}" upload-sourcemaps \
    "${batch[@]}" \
    --url-prefix "${URL_PREFIX}"
done

printf '[cli-sourcemaps] Uploaded %d file(s) in %d batch(es) for release %s\n' \
  "${total_files}" "${batch_number}" "${RELEASE_NAME}"
