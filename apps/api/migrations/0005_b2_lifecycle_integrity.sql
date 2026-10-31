-- B2: enforce lifecycle / acquisition / ownership / disposition integrity.
-- This migration does not activate legal-title proof, payments or Finance OS posting.
ALTER TABLE asset_os.ownership_interests
  ADD CONSTRAINT ownership_dimension_percentage CHECK (
    (dimension IN ('ECONOMIC','BENEFICIAL') AND percentage IS NOT NULL AND percentage > 0)
    OR (dimension IN ('LEGAL','CONTROL') AND percentage IS NULL)
  );
CREATE UNIQUE INDEX uq_ownership_current_party
  ON asset_os.ownership_interests(tenant_id,asset_id,dimension,party_ref)
  WHERE effective_to IS NULL;
CREATE INDEX idx_ownership_events_history
  ON asset_os.ownership_events(tenant_id,asset_id,recorded_at DESC,id DESC);
CREATE INDEX idx_lifecycle_events_history
  ON asset_os.lifecycle_events(tenant_id,asset_id,occurred_at DESC,id DESC);
CREATE INDEX idx_acquisitions_tenant_date
  ON asset_os.acquisitions(tenant_id,effective_on DESC,id DESC);
CREATE INDEX idx_dispositions_tenant_date
  ON asset_os.dispositions(tenant_id,effective_on DESC,id DESC);
ALTER TABLE asset_os.dispositions
  ADD COLUMN cost_basis_snapshot numeric(20,2) CHECK(cost_basis_snapshot >= 0),
  ADD COLUMN net_proceeds numeric(20,2) GENERATED ALWAYS AS (proceeds - costs) STORED,
  ADD COLUMN estimated_gain numeric(20,2) GENERATED ALWAYS AS
    (CASE WHEN cost_basis_snapshot IS NULL THEN NULL ELSE proceeds - costs - cost_basis_snapshot END) STORED,
  ADD CONSTRAINT disposition_net_proceeds_present CHECK(net_proceeds IS NOT NULL);

-- No user-facing services can delete/overwrite immutable history.
REVOKE UPDATE,DELETE ON asset_os.acquisitions,asset_os.acquisition_costs,
  asset_os.ownership_events,asset_os.lifecycle_events,asset_os.dispositions
  FROM asset_os_app;
REVOKE DELETE ON asset_os.ownership_interests FROM asset_os_app;
COMMENT ON COLUMN asset_os.dispositions.estimated_gain IS
 'Informational comparison of user-entered proceeds/costs to initial recorded cost basis. NOT realized taxable gain, ledger posting or authoritative cashflow.';
COMMENT ON TABLE asset_os.ownership_interests IS
 'User-recorded ownership claims, not a verified land/title/share register; percentage dimensions have per-asset serialization and service cap 100%.';
