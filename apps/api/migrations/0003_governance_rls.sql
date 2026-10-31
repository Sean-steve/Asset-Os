-- Asset OS B0 / 0003 — governance, event envelope and mandatory isolation.
-- All tenant data tables have FORCE RLS, including under the table owner.
CREATE TABLE asset_os.action_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
 asset_id uuid NOT NULL,
 source_key text NOT NULL,
 title text NOT NULL,
 context text NOT NULL DEFAULT '',
 proposed_due_on date,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEWED_LOCALLY','DISMISSED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_at timestamptz,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.alert_dispositions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
 identity_id uuid NOT NULL,
 alert_key text NOT NULL,
 status text NOT NULL CHECK(status IN ('ACKNOWLEDGED','SNOOZED')),
 snoozed_until date,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,identity_id,alert_key),
 CHECK(status <> 'SNOOZED' OR snoozed_until IS NOT NULL),
 FOREIGN KEY(tenant_id,identity_id) REFERENCES asset_os.identity_bindings(tenant_id,id)
);
CREATE TABLE asset_os.integration_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
 system text NOT NULL CHECK(system IN ('PERSONAL_KERNEL','WEALTH_OS','FINANCE_OS','MISSION_OS','KNOWLEDGE_OS','NOTIFICATIONS')),
 purpose text NOT NULL,
 intent_state text NOT NULL DEFAULT 'REQUESTED' CHECK(intent_state IN ('REQUESTED','WITHDRAWN')),
 connection_state text NOT NULL DEFAULT 'NOT_CONNECTED' CHECK(connection_state='NOT_CONNECTED'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE asset_os.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
 actor_binding_id uuid,
 request_id uuid NOT NULL,
 event_kind text NOT NULL CHECK(length(event_kind) BETWEEN 1 AND 140),
 subject_kind text NOT NULL,
 subject_id uuid,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(detail)='object'),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_binding_id) REFERENCES asset_os.identity_bindings(tenant_id,id)
);
CREATE INDEX idx_audit_tenant_time ON asset_os.audit_events(tenant_id,occurred_at DESC);
CREATE TABLE asset_os.outbox_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
 event_id uuid NOT NULL DEFAULT gen_random_uuid(),
 type text NOT NULL,
 schema_version integer NOT NULL CHECK(schema_version>=1),
 aggregate_kind text NOT NULL,
 aggregate_id uuid NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 correlation_id uuid NOT NULL,
 causation_id uuid,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 delivery_state text NOT NULL DEFAULT 'PENDING' CHECK(delivery_state IN ('PENDING','DISPATCHED','FAILED')),
 delivered_at timestamptz,
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,event_id)
);
CREATE INDEX idx_outbox_pending ON asset_os.outbox_events(occurred_at) WHERE delivery_state='PENDING';
CREATE TABLE asset_os.inbox_dedup (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
 source_system text NOT NULL,
 source_event_id text NOT NULL,
 event_version integer NOT NULL CHECK(event_version>=1),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,source_system,source_event_id)
);
CREATE TABLE asset_os.idempotency_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
 operation text NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
 request_hash text NOT NULL CHECK(length(request_hash)=64),
 response_code integer CHECK(response_code BETWEEN 100 AND 599),
 response_body jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,operation,idempotency_key),
 CHECK(expires_at>created_at)
);
CREATE INDEX idx_idempotency_expiration ON asset_os.idempotency_keys(expires_at);

-- The runtime credential MUST be a separate non-superuser, non-BYPASSRLS role,
-- created before this migration. Do not operate the API with the migration owner.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='asset_os_app') THEN
  RAISE EXCEPTION 'Create non-superuser asset_os_app role before running migrations';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='asset_os_app' AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'asset_os_app cannot be SUPERUSER or BYPASSRLS';
 END IF;
END $$;

DO $$
DECLARE r record;
DECLARE expr text;
BEGIN
 FOR r IN SELECT tablename FROM pg_tables
          WHERE schemaname='asset_os' AND tablename<>'schema_migrations'
 LOOP
  expr:=CASE WHEN r.tablename='tenants'
    THEN 'id = asset_os.current_tenant()'
    ELSE 'tenant_id = asset_os.current_tenant()' END;
  EXECUTE format('ALTER TABLE asset_os.%I ENABLE ROW LEVEL SECURITY',r.tablename);
  EXECUTE format('ALTER TABLE asset_os.%I FORCE ROW LEVEL SECURITY',r.tablename);
  EXECUTE format('CREATE POLICY tenant_isolation ON asset_os.%I USING (%s) WITH CHECK (%s)',r.tablename,expr,expr);
 END LOOP;
END $$;

GRANT USAGE ON SCHEMA asset_os TO asset_os_app;
GRANT EXECUTE ON FUNCTION asset_os.current_tenant() TO asset_os_app;
GRANT SELECT ON asset_os.schema_migrations TO asset_os_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA asset_os TO asset_os_app;

-- Migration state cannot be changed by the application.
REVOKE INSERT,UPDATE,DELETE ON asset_os.schema_migrations FROM asset_os_app;
-- Audit and inbox receipts are append-only for the runtime role.
REVOKE UPDATE,DELETE ON asset_os.audit_events FROM asset_os_app;
REVOKE UPDATE,DELETE ON asset_os.inbox_dedup FROM asset_os_app;
REVOKE DELETE ON asset_os.outbox_events FROM asset_os_app;
-- Identity and workspace policy cannot be changed through generic CRUD.
REVOKE INSERT,UPDATE,DELETE ON asset_os.identity_bindings,asset_os.tenant_memberships,asset_os.tenants FROM asset_os_app;

COMMENT ON TABLE asset_os.cash_flow_observations IS
 'User-entered or authenticated Finance OS projections only; NOT an authoritative transaction ledger';
COMMENT ON TABLE asset_os.audit_events IS
 'Backend audit event foundation. Append-only for runtime role; NOT cryptographically tamper-evident yet';
COMMENT ON TABLE asset_os.integration_plans IS
 'Planning only. NO credentials, tokens or live integration connections in Phase B0';
