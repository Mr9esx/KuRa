#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="/var/www/miaoplus.com"
DOMAIN="miaoplus.com"
ARCHIVE_PATH="${1:-/tmp/release.tar.gz}"

if [[ ! -f "${ARCHIVE_PATH}" ]]; then
  echo "Build archive not found: ${ARCHIVE_PATH}"
  exit 1
fi

# Install nginx if not present
if ! command -v nginx >/dev/null 2>&1; then
  apt-get update && apt-get install -y nginx
fi

mkdir -p "${DEPLOY_PATH}" /etc/risu /var/www/miaoplus.com/server/data

# Extract archive
TEMP_DIR=$(mktemp -d)
tar -xzf "${ARCHIVE_PATH}" -C "${TEMP_DIR}"

# Deploy frontend
rm -rf "${DEPLOY_PATH}/dist"
mv "${TEMP_DIR}/app/dist" "${DEPLOY_PATH}/dist"

# Deploy admin
rm -rf "${DEPLOY_PATH}/admin"
mv "${TEMP_DIR}/admin/dist" "${DEPLOY_PATH}/admin"

# Deploy Go server
systemctl stop risu-server 2>/dev/null || true
cp "${TEMP_DIR}/server/risu-server" /usr/local/bin/risu-server
chmod +x /usr/local/bin/risu-server

# Config (don't overwrite if exists)
if [[ ! -f /etc/risu/config.yaml ]]; then
  cp "${TEMP_DIR}/server/config.yaml" /etc/risu/config.yaml
  # Update paths for production
  sed -i 's|./data|/var/www/miaoplus.com/server/data|g' /etc/risu/config.yaml
  sed -i 's|../app/public|/var/www/miaoplus.com/dist|g' /etc/risu/config.yaml
fi

# Install systemd service
cp "$(dirname "$0")/systemd/risu-server.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable risu-server
systemctl start risu-server

# Nginx config (use sites-enabled; remove legacy conf.d duplicate)
rm -f "/etc/nginx/conf.d/${DOMAIN}.conf"
cp "$(dirname "$0")/nginx/${DOMAIN}.conf" "/etc/nginx/sites-available/${DOMAIN}.conf"
ln -sf "/etc/nginx/sites-available/${DOMAIN}.conf" "/etc/nginx/sites-enabled/${DOMAIN}.conf"
nginx -t
systemctl reload nginx

# Cleanup
rm -rf "${TEMP_DIR}"

echo "Deploy finished: ${DOMAIN}"
