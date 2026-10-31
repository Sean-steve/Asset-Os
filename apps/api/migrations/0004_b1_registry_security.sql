-- 0004 B1: supporting indexes and least-privilege registry write boundaries.
-- Auth decisions remain in the server after cryptographic OIDC verification.
CREATE INDEX idx_identity_verified_subject
 ON asset_os.identity_bindings (tenant_id,issuer,external_subject)
 WHERE binding_state = 'VERIFIED';
CREATE INDEX idx_active_member_lookup
 ON asset_os.tenant_memberships (tenant_id,identity_id,role)
 WHERE state='ACTIVE';
CREATE INDEX idx_assets_cursor
 ON asset_os.assets (tenant_id,created_at DESC,id DESC);
CREATE INDEX idx_idempotency_tenant_operation
 ON asset_os.idempotency_keys (tenant_id,operation,idempotency_key);
-- Assets are soft-disposed via lifecycle in later phases; never physically deleted by the API.
REVOKE DELETE ON asset_os.assets FROM asset_os_app;
-- Runtime may enqueue events, but delivery status belongs to a separately
-- permissioned future dispatcher; never fake successful delivery in B1.
REVOKE UPDATE,DELETE ON asset_os.outbox_events FROM asset_os_app;
COMMENT ON TABLE asset_os.identity_bindings IS
 'Verified issuer-subject bindings, provisioned via privileged token-verifying bootstrap, never self-asserted client headers.';
COMMENT ON TABLE asset_os.tenant_memberships IS
 'Active membership required in the SAME tenant-scoped database transaction as every asset domain command.';
