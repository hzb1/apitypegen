#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UI_DIR="${ROOT_DIR}/ui"
ASSETS_DIR="${UI_DIR}/dist/assets"

if [[ -f "${ROOT_DIR}/.env.glitchtip.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env.glitchtip.local"
  set +a
fi

RELEASE_NAME="${npm_package_version:?npm_package_version is required}"
ORGANIZATION="${UI_SENTRY_ORG:-ts-swagger}"
PROJECT="${UI_SENTRY_PROJECT:-3}"
URL_PREFIX="${UI_SOURCEMAP_URL_PREFIX:-https://swagger.huzhibin.top/assets/}"
BATCH_FILE_COUNT="${SOURCEMAP_BATCH_FILE_COUNT:-4}"
MAX_FILE_BYTES="${SOURCEMAP_MAX_FILE_BYTES:-10000000}"

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

case "${MAX_FILE_BYTES}" in
  ''|*[!0-9]*)
    fail "SOURCEMAP_MAX_FILE_BYTES must be a positive integer"
    ;;
esac

if [[ "${MAX_FILE_BYTES}" -lt 1 ]]; then
  fail "SOURCEMAP_MAX_FILE_BYTES must be at least 1"
fi

[[ -d "${ASSETS_DIR}" ]] || fail "Assets directory not found: ${ASSETS_DIR}"
command -v sentry-cli >/dev/null 2>&1 || fail "sentry-cli is not available"
[[ -n "${SENTRY_URL:-}" ]] || fail "SENTRY_URL is required; configure .env.glitchtip.local or the CI secret"
[[ -n "${SENTRY_AUTH_TOKEN:-}" ]] || fail "SENTRY_AUTH_TOKEN is required; configure .env.glitchtip.local or the CI secret"

files=()
skipped_files=0

file_size() {
  if stat --version >/dev/null 2>&1; then
    stat -c '%s' "$1"
  else
    stat -f '%z' "$1"
  fi
}

for javascript_file in "${ASSETS_DIR}"/*.js; do
  [[ -f "${javascript_file}" ]] || continue
  map_file="${javascript_file}.map"
  javascript_size="$(file_size "${javascript_file}")"
  map_size=0
  [[ -f "${map_file}" ]] && map_size="$(file_size "${map_file}")"

  # 第三方 TypeScript Compiler 的 source map 体积很大，且不包含应用源码；
  # 超过 GlitchTip 单次请求限制时跳过整对文件，避免整次发布因 413 失败。
  if [[ "${javascript_size}" -gt "${MAX_FILE_BYTES}" || "${map_size}" -gt "${MAX_FILE_BYTES}" ]]; then
    printf '[sourcemaps] Skipping oversized sourcemap pair: %s (%s bytes, map %s bytes)\n' \
      "$(basename "${javascript_file}")" "${javascript_size}" "${map_size}" >&2
    skipped_files=$((skipped_files + 2))
    continue
  fi

  files+=("${javascript_file}")
  if [[ -f "${map_file}" ]]; then
    files+=("${map_file}")
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
    --org "${ORGANIZATION}" \
    --project "${PROJECT}" \
    files "${RELEASE_NAME}" upload-sourcemaps \
    "${batch[@]}" \
    --url-prefix "${URL_PREFIX}"
done

printf '[sourcemaps] Uploaded %d file(s) in %d batch(es) for release %s\n' \
  "${total_files}" "${batch_number}" "${RELEASE_NAME}"
if [[ "${skipped_files}" -gt 0 ]]; then
  printf '[sourcemaps] Skipped %d oversized file(s); configure SOURCEMAP_MAX_FILE_BYTES to override\n' \
    "${skipped_files}" >&2
fi
