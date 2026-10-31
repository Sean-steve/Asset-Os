#!/bin/sh
set -eu
: "${ASSET_OS_APP_PASSWORD:?Set ASSET_OS_APP_PASSWORD in infra/.env}"
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v role_password="$ASSET_OS_APP_PASSWORD" \
  -f /opt/asset-os/create-runtime-role.sql
