#!/usr/bin/env bash
set -euo pipefail

RELEASE_ID="${1:-}"
DEPLOY_PATH="/var/www/miaoplus.com"
RELEASES_DIR="${DEPLOY_PATH}/releases"
SERVER_BIN="/usr/local/bin/risu-server"
RECORDER_BIN="/usr/local/bin/risu-release-recorder"
LATEST_FILE="${RELEASES_DIR}/LATEST"

if [[ -z "${RELEASE_ID}" ]]; then
  echo "Usage: risu-rollback <release_id>"
  exit 1
fi

TARGET_DIR="${RELEASES_DIR}/${RELEASE_ID}"
if [[ ! -d "${TARGET_DIR}" ]]; then
  echo "Release not found: ${TARGET_DIR}"
  exit 1
fi

if [[ ! -d "${TARGET_DIR}/dist" || ! -d "${TARGET_DIR}/admin" || ! -f "${TARGET_DIR}/server/risu-server" ]]; then
  echo "Release artifacts are incomplete: ${TARGET_DIR}"
  exit 1
fi

echo "Rolling back to release: ${RELEASE_ID}"

CURRENT_RELEASE_ID=""
if [[ -f "${LATEST_FILE}" ]]; then
  CURRENT_RELEASE_ID="$(cat "${LATEST_FILE}")"
fi

systemctl stop risu-server || true

rm -rf "${DEPLOY_PATH}/dist"
cp -a "${TARGET_DIR}/dist" "${DEPLOY_PATH}/dist"

rm -rf "${DEPLOY_PATH}/admin"
cp -a "${TARGET_DIR}/admin" "${DEPLOY_PATH}/admin"

cp "${TARGET_DIR}/server/risu-server" "${SERVER_BIN}"
chmod +x "${SERVER_BIN}"
echo "${RELEASE_ID}" > "${LATEST_FILE}"

systemctl start risu-server
nginx -t && systemctl reload nginx

if [[ -n "${CURRENT_RELEASE_ID}" && "${CURRENT_RELEASE_ID}" != "${RELEASE_ID}" && -x "${RECORDER_BIN}" && -f /etc/risu/config.yaml ]]; then
  RISU_CONFIG=/etc/risu/config.yaml "${RECORDER_BIN}" rollback \
    --from-release-id "${CURRENT_RELEASE_ID}" \
    --to-release-id "${RELEASE_ID}" \
    --operator "${SUDO_USER:-$USER}" \
    --reason "manual rollback via risu-rollback script" || true
fi

echo "Rollback complete: ${RELEASE_ID}"
