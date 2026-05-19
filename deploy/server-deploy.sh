#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="/var/www/miaoplus.com"
DOMAIN="miaoplus.com"
ARCHIVE_PATH="${1:-/tmp/release.tar.gz}"

if [[ ! -f "${ARCHIVE_PATH}" ]]; then
  echo "Build archive not found: ${ARCHIVE_PATH}"
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y nginx
  elif command -v yum >/dev/null 2>&1; then
    yum install -y nginx
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nginx
  else
    echo "Unsupported Linux distribution: cannot install nginx automatically."
    exit 1
  fi
fi

mkdir -p "${DEPLOY_PATH}"
rm -rf "${DEPLOY_PATH}/dist"
tar -xzf "${ARCHIVE_PATH}" -C "${DEPLOY_PATH}"

cat > /etc/nginx/conf.d/${DOMAIN}.conf <<EOF
server {
  listen 80;
  server_name ${DOMAIN} www.${DOMAIN};

  root ${DEPLOY_PATH}/dist;
  index index.html;

  location / {
    try_files \$uri \$uri/ /index.html;
  }

  location /assets/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
}
EOF

nginx -t
systemctl enable nginx || true
systemctl reload nginx || systemctl restart nginx

echo "Deploy finished: ${DOMAIN}"
