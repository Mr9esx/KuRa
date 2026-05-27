#!/usr/bin/env bash
set -euo pipefail

#─── Configuration ───────────────────────────────────────────────
DEPLOY_HOST="118.196.126.221"
DEPLOY_USER="root"
DEPLOY_PORT="22022"
SSH_KEY="$HOME/.ssh/deploy_key"
VITE_AMAP_KEY="${VITE_AMAP_KEY:-}"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/.build"

#─── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}▶ $1${NC}"; }
ok()    { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
fail()  { echo -e "${RED}✗ $1${NC}"; exit 1; }

#─── Pre-flight checks ──────────────────────────────────────────
step "Pre-flight checks"

[[ -f "$SSH_KEY" ]] || fail "SSH key not found: $SSH_KEY"
command -v pnpm   >/dev/null || fail "pnpm not found"
command -v go     >/dev/null || fail "go not found"
command -v ssh    >/dev/null || fail "ssh not found"
command -v scp    >/dev/null || fail "scp not found"

cd "$PROJECT_ROOT"

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "release" ]]; then
  warn "Current branch is '$CURRENT_BRANCH', not main/release"
fi

AFTER_SHA="$(git rev-parse HEAD)"
BEFORE_SHA="$(git rev-parse HEAD~1 2>/dev/null || echo '0000000000000000000000000000000000000000')"
RELEASE_ID="$(date +%Y%m%d%H%M%S)-${AFTER_SHA:0:7}"

ok "Project: $PROJECT_ROOT"
ok "Release: $RELEASE_ID"
ok "Commit:  ${AFTER_SHA:0:7} ($(git log -1 --format='%s'))"

#─── Clean build dir ─────────────────────────────────────────────
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/release-meta"

#─── Step 1: Build frontend app ──────────────────────────────────
step "Building frontend app"
(cd app && VITE_API_BASE="" npx vite build)
ok "app/dist built"

#─── Step 2: Build admin panel ───────────────────────────────────
step "Building admin panel"
if [[ -n "$VITE_AMAP_KEY" ]]; then
  (cd admin && VITE_AMAP_KEY="$VITE_AMAP_KEY" npx vite build)
else
  warn "VITE_AMAP_KEY not set, geo map may not work"
  (cd admin && npx vite build)
fi
ok "admin/dist built"

#─── Step 3: Cross-compile Go server for Linux ───────────────────
step "Building Go server (linux/amd64)"

if [[ "$(uname -s)" == "Darwin" ]]; then
  if command -v x86_64-linux-musl-gcc >/dev/null 2>&1; then
    CC_LINUX="x86_64-linux-musl-gcc"
  elif command -v x86_64-unknown-linux-gnu-gcc >/dev/null 2>&1; then
    CC_LINUX="x86_64-unknown-linux-gnu-gcc"
  elif command -v zig >/dev/null 2>&1; then
    CC_LINUX="zig cc -target x86_64-linux-musl"
  else
    fail "No Linux cross-compiler found. Install one of:\n  brew install filosottile/musl-cross/musl-cross\n  brew install zig"
  fi
  ok "Cross-compiler: $CC_LINUX"

  (
    cd server
    CGO_ENABLED=1 GOOS=linux GOARCH=amd64 CC="$CC_LINUX" \
      go build -o risu-server ./cmd/
    CGO_ENABLED=1 GOOS=linux GOARCH=amd64 CC="$CC_LINUX" \
      go build -o risu-release-recorder ./cmd/release-recorder
  )
else
  (
    cd server
    CGO_ENABLED=1 go build -o risu-server ./cmd/
    CGO_ENABLED=1 go build -o risu-release-recorder ./cmd/release-recorder
  )
fi
ok "Go binaries built"

#─── Step 4: Generate release metadata ──────────────────────────
step "Generating release metadata"

echo "$RELEASE_ID" > "$BUILD_DIR/release-meta/release_id.txt"
echo "$BEFORE_SHA" > "$BUILD_DIR/release-meta/before_sha.txt"
echo "$AFTER_SHA"  > "$BUILD_DIR/release-meta/after_sha.txt"

{
  echo "Release ID: $RELEASE_ID"
  echo "Before: $BEFORE_SHA"
  echo "After:  $AFTER_SHA"
  echo "Generated At: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo
  echo "## Commit Diff"
  if [[ "$BEFORE_SHA" != "0000000000000000000000000000000000000000" ]]; then
    git log --oneline "${BEFORE_SHA}..${AFTER_SHA}" 2>/dev/null || echo "(single commit)"
  else
    echo "Initial release"
  fi
  echo
  echo "## File Diff (stat)"
  if [[ "$BEFORE_SHA" != "0000000000000000000000000000000000000000" ]]; then
    git diff --stat "${BEFORE_SHA}..${AFTER_SHA}" 2>/dev/null || true
  fi
} > "$BUILD_DIR/release-meta/deploy-diff.txt"

ok "Release metadata generated"

#─── Step 5: Pack archive ───────────────────────────────────────
step "Packing release archive"

ARCHIVE="$BUILD_DIR/release.tar.gz"
tar -czf "$ARCHIVE" \
  app/dist \
  admin/dist \
  server/risu-server \
  server/risu-release-recorder \
  server/internal/geo/data/GeoLite2-City.mmdb \
  deploy/ \
  -C "$BUILD_DIR" release-meta

ARCHIVE_SIZE=$(du -h "$ARCHIVE" | cut -f1)
ok "Archive: $ARCHIVE ($ARCHIVE_SIZE)"

#─── Step 6: Upload to server ───────────────────────────────────
step "Uploading to server ($DEPLOY_HOST)"

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"

scp -P "$DEPLOY_PORT" $SSH_OPTS "$ARCHIVE" "${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/release.tar.gz"
ok "Archive uploaded"

#─── Step 7: Deploy on server ───────────────────────────────────
step "Deploying on server"

# shellcheck disable=SC2087
ssh -p "$DEPLOY_PORT" $SSH_OPTS "${DEPLOY_USER}@${DEPLOY_HOST}" bash -s <<'REMOTE_SCRIPT'
set -e

DEPLOY_PATH="/var/www/miaoplus.com"
RELEASE_TMP="/tmp/risu-release"
RELEASES_DIR="${DEPLOY_PATH}/releases"

rm -rf "${RELEASE_TMP}"
mkdir -p "${RELEASE_TMP}" "${DEPLOY_PATH}" "${RELEASES_DIR}"

tar -xzf /tmp/release.tar.gz -C "${RELEASE_TMP}"
rm -f /tmp/release.tar.gz

RELEASE_ID="$(cat "${RELEASE_TMP}/release-meta/release_id.txt")"
BEFORE_SHA="$(cat "${RELEASE_TMP}/release-meta/before_sha.txt")"
AFTER_SHA="$(cat "${RELEASE_TMP}/release-meta/after_sha.txt")"
CURRENT_RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
mkdir -p "${CURRENT_RELEASE_DIR}/server"

PREVIOUS_RELEASE_ID=""
if [[ -f "${RELEASES_DIR}/LATEST" ]]; then
  PREVIOUS_RELEASE_ID="$(cat "${RELEASES_DIR}/LATEST")"
fi

cp -a "${RELEASE_TMP}/app/dist" "${CURRENT_RELEASE_DIR}/dist"
cp -a "${RELEASE_TMP}/admin/dist" "${CURRENT_RELEASE_DIR}/admin"
cp "${RELEASE_TMP}/server/risu-server" "${CURRENT_RELEASE_DIR}/server/risu-server"
cp "${RELEASE_TMP}/server/risu-release-recorder" "${CURRENT_RELEASE_DIR}/server/risu-release-recorder"
if [ -f "${RELEASE_TMP}/server/internal/geo/data/GeoLite2-City.mmdb" ]; then
  cp "${RELEASE_TMP}/server/internal/geo/data/GeoLite2-City.mmdb" "${CURRENT_RELEASE_DIR}/server/GeoLite2-City.mmdb"
fi
cp -a "${RELEASE_TMP}/release-meta" "${CURRENT_RELEASE_DIR}/meta"
cp "${RELEASE_TMP}/release-meta/deploy-diff.txt" "${CURRENT_RELEASE_DIR}/CHANGELOG.txt"
echo "${RELEASE_ID}" > "${RELEASES_DIR}/LATEST"

echo "===== Release Summary ====="
cat "${CURRENT_RELEASE_DIR}/CHANGELOG.txt"
echo "==========================="

# Deploy frontend
rm -rf "${DEPLOY_PATH}/dist"
cp -a "${CURRENT_RELEASE_DIR}/dist" "${DEPLOY_PATH}/dist"

# Deploy admin
rm -rf "${DEPLOY_PATH}/admin"
cp -a "${CURRENT_RELEASE_DIR}/admin" "${DEPLOY_PATH}/admin"

# Deploy Go server
systemctl stop risu-server || true
cp "${CURRENT_RELEASE_DIR}/server/risu-server" /usr/local/bin/risu-server
chmod +x /usr/local/bin/risu-server
cp "${CURRENT_RELEASE_DIR}/server/risu-release-recorder" /usr/local/bin/risu-release-recorder
chmod +x /usr/local/bin/risu-release-recorder

# Deploy config (only if not exists)
mkdir -p /etc/risu
if [ ! -f /etc/risu/config.yaml ]; then
  cp "${RELEASE_TMP}/deploy/config.production.yaml" /etc/risu/config.yaml
fi

if ! grep -q 'geoip_db' /etc/risu/config.yaml 2>/dev/null; then
  sed -i '/publish_dir:/a\  geoip_db: "/var/lib/risu/GeoLite2-City.mmdb"' /etc/risu/config.yaml
fi

# Deploy GeoIP database
if [ -f "${CURRENT_RELEASE_DIR}/server/GeoLite2-City.mmdb" ]; then
  cp "${CURRENT_RELEASE_DIR}/server/GeoLite2-City.mmdb" /var/lib/risu/GeoLite2-City.mmdb
fi

# Ensure data directories
mkdir -p /var/lib/risu/data
chown -R www-data:www-data /var/lib/risu
chmod 750 /var/lib/risu
chmod 750 /var/lib/risu/data

# Deploy systemd service
cp "${RELEASE_TMP}/deploy/systemd/risu-server.service" /etc/systemd/system/risu-server.service
systemctl daemon-reload

# Deploy nginx config
rm -f /etc/nginx/conf.d/miaoplus.com.conf
cp "${RELEASE_TMP}/deploy/nginx/miaoplus.com.conf" /etc/nginx/sites-available/miaoplus.com.conf
ln -sf /etc/nginx/sites-available/miaoplus.com.conf /etc/nginx/sites-enabled/miaoplus.com.conf

# Install rollback tool
cp "${RELEASE_TMP}/deploy/rollback-release.sh" /usr/local/bin/risu-rollback
chmod +x /usr/local/bin/risu-rollback

# Cleanup
rm -rf "${RELEASE_TMP}"

# Restart services
systemctl start risu-server
nginx -t && systemctl reload nginx

# Record release metadata
if [[ -x /usr/local/bin/risu-release-recorder && -f /etc/risu/config.yaml ]]; then
  RISU_CONFIG=/etc/risu/config.yaml /usr/local/bin/risu-release-recorder deploy \
    --release-id "${RELEASE_ID}" \
    --branch "release" \
    --before-sha "${BEFORE_SHA}" \
    --after-sha "${AFTER_SHA}" \
    --artifact-path "${CURRENT_RELEASE_DIR}" \
    --diff-file "${CURRENT_RELEASE_DIR}/CHANGELOG.txt" \
    --status "deployed"
fi

echo ""
echo "Deploy finished at $(date)"
echo "Release ID: ${RELEASE_ID}"
if [[ -n "${PREVIOUS_RELEASE_ID}" ]]; then
  echo "Previous Release ID: ${PREVIOUS_RELEASE_ID}"
fi
echo "Rollback command: sudo risu-rollback ${RELEASE_ID}"
REMOTE_SCRIPT

#─── Done ────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete: ${RELEASE_ID}${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
