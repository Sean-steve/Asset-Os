#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p .local
chmod 700 .local
CONFIG=.local/asset-os.env
if [[ -L "$CONFIG" ]]; then echo "Refusing symlink for local secrets." >&2; exit 1; fi
if [[ ! -f "$CONFIG" ]]; then
  OWNER="$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")"
  APP="$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")"
  LOGIN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(16).toString('hex'))")"
  ADMIN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
  cat > "$CONFIG" <<EOF
NODE_ENV=development
HOST=127.0.0.1
PORT=3001
DATABASE_URL=postgresql://asset_os_app:${APP}@127.0.0.1:5432/asset_os
MIGRATION_DATABASE_URL=postgresql://asset_os_owner:${OWNER}@127.0.0.1:5432/asset_os
OIDC_ISSUER=http://127.0.0.1:3003
OIDC_AUDIENCE=asset-os-api
OIDC_JWKS_URL=http://127.0.0.1:3003/jwks
ASSET_OS_ALLOW_LOCAL_OIDC=yes
LOCAL_IDP_ENABLED=yes
LOCAL_IDP_PASSWORD=${LOGIN}
LOCAL_IDP_ADMIN_SECRET=${ADMIN}
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
ASSET_OS_LOCAL_MODE=yes
EOF
fi
chmod 600 "$CONFIG"
source "$CONFIG"
OWNER="${MIGRATION_DATABASE_URL#*://asset_os_owner:}"
OWNER="${OWNER%%@*}"
APP="${DATABASE_URL#*://asset_os_app:}"
APP="${APP%%@*}"
if [[ ! "$OWNER" =~ ^[0-9a-f]{48}$ || ! "$APP" =~ ^[0-9a-f]{48}$ ]]; then
 echo "Invalid local DB credential format; refusing to overwrite credentials." >&2; exit 1
fi
echo "Provisioning local PostgreSQL database asset_os (no existing data deleted)..."
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres -v owner_pass="$OWNER" -v app_pass="$APP" <<'SQL'
SELECT 'CREATE ROLE asset_os_owner LOGIN' WHERE NOT EXISTS
 (SELECT 1 FROM pg_roles WHERE rolname='asset_os_owner') \gexec
SELECT 'CREATE ROLE asset_os_app LOGIN' WHERE NOT EXISTS
 (SELECT 1 FROM pg_roles WHERE rolname='asset_os_app') \gexec
SELECT format('ALTER ROLE asset_os_owner LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', :'owner_pass') \gexec
SELECT format('ALTER ROLE asset_os_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', :'app_pass') \gexec
SELECT 'CREATE DATABASE asset_os OWNER asset_os_owner' WHERE NOT EXISTS
 (SELECT 1 FROM pg_database WHERE datname='asset_os') \gexec
DO $$
BEGIN
 IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='asset_os') <> 'asset_os_owner' THEN
  RAISE EXCEPTION 'Existing asset_os database has a different owner. Refusing to modify it.';
 END IF;
END $$;
GRANT CONNECT ON DATABASE asset_os TO asset_os_app;
SQL
npm --prefix apps/api install --no-audit --no-fund
npm --prefix apps/api run build
node --env-file="$CONFIG" apps/api/dist/migrate.js
node --env-file="$CONFIG" apps/api/dist/migrate.js --check
echo "Local DB ready. Next: npm install && npm run local:dev"
