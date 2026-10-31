-- B3: durable valuation, financing and user-entered economics observations.
-- No authoritative bank balances, loan servicing, reconciled transactions or taxes.
CREATE UNIQUE INDEX uq_b3_accepted_valuation
 ON asset_os.valuations(tenant_id,asset_id) WHERE status='ACCEPTED';
CREATE INDEX idx_b3_valuation_record_history
 ON asset_os.valuations(tenant_id,asset_id,recorded_at DESC,id DESC);
CREATE INDEX idx_b3_financing_facility_asset
 ON asset_os.financing_facilities(tenant_id,asset_id,recorded_at DESC,id DESC);
CREATE INDEX idx_b3_financing_balance_cursor
 ON asset_os.financing_balances(tenant_id,facility_id,observed_on DESC,id DESC);
CREATE INDEX idx_b3_flow_cursor
 ON asset_os.cash_flow_observations(tenant_id,asset_id,occurred_on DESC,id DESC);
CREATE INDEX idx_b3_reference_tenant_flow
 ON asset_os.reconciliation_references(tenant_id,flow_id,recorded_at DESC);
ALTER TABLE asset_os.valuations
 ADD CONSTRAINT b3_accepted_history_has_time CHECK (
    (status='DRAFT' AND accepted_at IS NULL) OR
    (status IN ('ACCEPTED','SUPERSEDED') AND accepted_at IS NOT NULL)
 );
ALTER TABLE asset_os.financing_facilities
 ADD CONSTRAINT b3_financier_nonempty CHECK (length(trim(financier_label)) BETWEEN 1 AND 160);
ALTER TABLE asset_os.cash_flow_observations
 ADD CONSTRAINT b3_user_flow_has_no_external_event CHECK (
   (source_authority='USER_ENTRY' AND source_event_id IS NULL) OR
   (source_authority='FINANCE_OS_PROJECTION' AND source_event_id IS NOT NULL)
 );
-- Domain history is append-only. Only controlled valuation promotion/supersession
-- may update status and accepted_at; amount and evidence cannot be altered.
REVOKE UPDATE, DELETE ON asset_os.valuations FROM asset_os_app;
GRANT UPDATE(status,accepted_at) ON asset_os.valuations TO asset_os_app;
REVOKE UPDATE,DELETE ON asset_os.financing_facilities,asset_os.financing_balances,
 asset_os.cash_flow_observations,asset_os.reconciliation_references FROM asset_os_app;
COMMENT ON TABLE asset_os.valuations IS 'User-entered valuation snapshots; ACCEPTED is an internal approval, not independent verification.';
COMMENT ON TABLE asset_os.financing_facilities IS 'Recorded facility details only; no bank agreement or payments are verified.';
COMMENT ON TABLE asset_os.financing_balances IS 'User-entered outstanding principal observations; not lender-verified.';
COMMENT ON TABLE asset_os.reconciliation_references IS 'Reference labels only. Never Finance OS ledger or confirmed transaction reconciliation.';
