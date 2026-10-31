-- Asset OS B0 / 0001 — canonical tenant, identity and registry foundation
-- Execute only as migration owner; runtime uses a different, non-BYPASSRLS role.
CREATE SCHEMA IF NOT EXISTS asset_os;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION asset_os.current_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE TABLE asset_os.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE asset_os.identity_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id) ON DELETE RESTRICT,
  issuer text NOT NULL CHECK(length(issuer) BETWEEN 1 AND 250),
  external_subject text NOT NULL CHECK(length(external_subject) BETWEEN 1 AND 250),
  binding_state text NOT NULL DEFAULT 'PENDING' CHECK(binding_state IN ('PENDING','VERIFIED','REVOKED')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,issuer,external_subject),
  CHECK (binding_state <> 'VERIFIED' OR verified_at IS NOT NULL)
);

CREATE TABLE asset_os.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id) ON DELETE RESTRICT,
  identity_id uuid NOT NULL,
  role text NOT NULL CHECK(role IN ('WORKSPACE_OWNER','OPERATIONS','PORTFOLIO_ANALYST','VIEWER')),
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACTIVE','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,identity_id),
  FOREIGN KEY(tenant_id,identity_id) REFERENCES asset_os.identity_bindings(tenant_id,id)
);
CREATE INDEX idx_memberships_state ON asset_os.tenant_memberships(tenant_id,state);

CREATE TABLE asset_os.asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,name),
  FOREIGN KEY (tenant_id,parent_id) REFERENCES asset_os.asset_categories(tenant_id,id)
);

CREATE TABLE asset_os.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id) ON DELETE RESTRICT,
  asset_number text NOT NULL CHECK(length(asset_number) BETWEEN 1 AND 40),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK(length(category) BETWEEN 1 AND 120),
  subcategory text NOT NULL DEFAULT '',
  lifecycle text NOT NULL DEFAULT 'PLANNED'
    CHECK(lifecycle IN ('PLANNED','ACQUISITION_PENDING','ACQUIRED','ACTIVE','SUSPENDED','DISPOSED','ARCHIVED')),
  operational_state text NOT NULL DEFAULT 'IDLE'
    CHECK(operational_state IN ('OPERATIONAL','IDLE','MAINTENANCE','DAMAGED','INOPERABLE')),
  risk_label text NOT NULL DEFAULT 'NORMAL'
    CHECK(risk_label IN ('NORMAL','WATCH','AT_RISK','CRITICAL')),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  registry_value numeric(20,2) CHECK(registry_value >= 0),
  value_as_of date,
  location_label text NOT NULL DEFAULT '',
  owner_display_label text NOT NULL DEFAULT '',
  acquired_on date,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(custom_fields) = 'object'),
  record_version integer NOT NULL DEFAULT 1 CHECK(record_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,asset_number),
  FOREIGN KEY (tenant_id,created_by) REFERENCES asset_os.identity_bindings(tenant_id,id)
);
CREATE INDEX idx_assets_tenant_lifecycle ON asset_os.assets(tenant_id,lifecycle,updated_at DESC);
CREATE INDEX idx_assets_tenant_category ON asset_os.assets(tenant_id,category);
CREATE INDEX idx_assets_tenant_name ON asset_os.assets(tenant_id,name);

CREATE TABLE asset_os.asset_tags (
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL,
  tag text NOT NULL CHECK(length(tag) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,asset_id,tag),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id) ON DELETE CASCADE
);
