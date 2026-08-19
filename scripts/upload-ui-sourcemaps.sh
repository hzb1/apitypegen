#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UI_DIR="${ROOT_DIR}/ui"
ASSETS_DIR="${UI_DIR}/dist/assets"

RELEASE_NAME="${npm_package_version:?npm_package_version is required}"
SENTRY_URL="${SENTRY_URL:-https://monitor.huzhibin.top}"
SOURCEMAP_URL_PREFIX="${SOURCEMAP_URL_PREFIX:-https://swagger.huzhibin.top/assets/}"
BATCH_FILE_COUNT="${SOURCEMAP_BATCH_FILE_COUNT:-4}"

fail() {
  printf '[sourcemaps] ERROR: %s\n' "$*" >&2
  exit 1
}

case "${BATCH_FILE_COUNT}" in
  ''|*[!0-9]*)
    fail "SOURCEMAP_BATCH_FILE_COUNT must be a positive integer"
    ;;
esac

if [[ "${BATCH_FILE_COUNT}" -lt 1 ]]; then
  fail "SOURCEMAP_BATCH_FILE_COUNT must be at least 1"
fi

[[ -d "${ASSETS_DIR}" ]] || fail "Assets directory not found: ${ASSETS_DIR}"
command -v sentry-cli >/dev/null 2>&1 || fail "sentry-cli is not available"

files=()
for javascript_file in "${ASSETS_DIR}"/*.js; do
  [[ -f "${javascript_file}" ]] || continue
  files+=("${javascript_file}")
  if [[ -f "${javascript_file}.map" ]]; then
    files+=("${javascript_file}.map")
  fi
done

[[ "${#files[@]}" -gt 0 ]] || fail "No JavaScript or sourcemap files found in ${ASSETS_DIR}"

total_files="${#files[@]}"
batch_number=0

for ((batch_start = 0; batch_start < total_files; batch_start += BATCH_FILE_COUNT)); do
  batch_number=$((batch_number + 1))
  batch=("${files[@]:batch_start:BATCH_FILE_COUNT}")
  batch_end=$((batch_start + ${#batch[@]}))

  printf '[sourcemaps] Uploading batch %d: files %d-%d of %d\n' \
    "${batch_number}" "$((batch_start + 1))" "${batch_end}" "${total_files}"

  SENTRY_URL="${SENTRY_URL}" sentry-cli releases \
    --org swaggerhuzhibintop \
    --project swagger \
    files "${RELEASE_NAME}" upload-sourcemaps \
    "${batch[@]}" \
    --url-prefix "${SOURCEMAP_URL_PREFIX}"
done

printf '[sourcemaps] Uploaded %d file(s) in %d batch(es) for release %s\n' \
  "${total_files}" "${batch_number}" "${RELEASE_NAME}"
