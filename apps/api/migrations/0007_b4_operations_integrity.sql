-- B4 operational authority: existing 0002 domain tables gain strict relational
-- integrity, append-only observations and least-privileged state transitions.
-- Records are user-entered planning/evidence, not dispatched jobs or verified insurance.
ALTER TABLE asset_os.maintenance_plans
 ADD CONSTRAINT b4_plan_asset_identity UNIQUE(tenant_id,asset_id,id),
 ADD CONSTRAINT b4_plan_title_length CHECK(length(trim(title)) BETWEEN 1 AND 160),
 ADD CONSTRAINT b4_plan_description_length CHECK(length(description)<=1200),
 ADD CONSTRAINT b4_plan_completion_date CHECK(last_completed_on IS NULL OR last_completed_on<=next_due);
ALTER TABLE asset_os.service_jobs
 ADD CONSTRAINT b4_job_plan_same_asset FOREIGN KEY(tenant_id,asset_id,plan_id)
   REFERENCES asset_os.maintenance_plans(tenant_id,asset_id,id),
 ADD CONSTRAINT b4_job_title_length CHECK(length(trim(title)) BETWEEN 1 AND 160),
 ADD CONSTRAINT b4_job_completion_state CHECK (
   (status='COMPLETED' AND completed_on IS NOT NULL) OR
   (status<>'COMPLETED' AND completed_on IS NULL AND recorded_cost IS NULL AND completion_notes='')
 ),
 ADD CONSTRAINT b4_job_provider_label_limit CHECK(length(provider_label)<=160);
ALTER TABLE asset_os.insurance_policies
 ADD CONSTRAINT b4_policy_asset_identity UNIQUE(tenant_id,asset_id,id),
 ADD CONSTRAINT b4_policy_replace_same_asset FOREIGN KEY(tenant_id,asset_id,replaces_id)
   REFERENCES asset_os.insurance_policies(tenant_id,asset_id,id),
 ADD CONSTRAINT b4_policy_insurer_length CHECK(length(trim(insurer_label)) BETWEEN 1 AND 160),
 ADD CONSTRAINT b4_policy_type_length CHECK(length(trim(policy_type)) BETWEEN 1 AND 120);
CREATE UNIQUE INDEX uq_b4_policy_replacement ON asset_os.insurance_policies(tenant_id,replaces_id)
 WHERE replaces_id IS NOT NULL;
CREATE INDEX idx_b4_maintenance_by_asset ON asset_os.maintenance_plans(tenant_id,asset_id,next_due,id);
CREATE INDEX idx_b4_jobs_by_asset ON asset_os.service_jobs(tenant_id,asset_id,scheduled_for DESC,id DESC);
CREATE INDEX idx_b4_policies_by_asset ON asset_os.insurance_policies(tenant_id,asset_id,end_on DESC,id DESC);
CREATE INDEX idx_b4_readings_by_asset ON asset_os.utilization_readings(tenant_id,asset_id,metric,observed_on DESC,id DESC);
CREATE INDEX idx_b4_docs_by_asset ON asset_os.document_references(tenant_id,asset_id,recorded_at DESC,id DESC);
CREATE INDEX idx_b4_locations_by_asset ON asset_os.location_events(tenant_id,asset_id,effective_on DESC,id DESC);
CREATE INDEX idx_b4_relations_by_asset ON asset_os.asset_relationships(tenant_id,asset_id,recorded_at DESC,id DESC);
ALTER TABLE asset_os.utilization_readings ADD CONSTRAINT b4_utilization_source_length
 CHECK(length(trim(source_label)) BETWEEN 1 AND 160);
ALTER TABLE asset_os.document_references ADD CONSTRAINT b4_evidence_reference_length
 CHECK(length(trim(opaque_reference)) BETWEEN 1 AND 300);
ALTER TABLE asset_os.asset_relationships ADD CONSTRAINT b4_relation_note_length CHECK(length(note)<=500);

-- Runtime may insert evidence, never rewrite readings, documentation,
-- locations, relationships or operational history.
REVOKE UPDATE,DELETE ON asset_os.maintenance_plans,asset_os.service_jobs,
 asset_os.insurance_policies,asset_os.utilization_readings,asset_os.document_references,
 asset_os.location_events,asset_os.asset_relationships FROM asset_os_app;
GRANT UPDATE(status,next_due,last_completed_on) ON asset_os.maintenance_plans TO asset_os_app;
GRANT UPDATE(status,completed_on,recorded_cost,completion_notes) ON asset_os.service_jobs TO asset_os_app;
GRANT UPDATE(status) ON asset_os.insurance_policies TO asset_os_app;

COMMENT ON TABLE asset_os.service_jobs IS
 'B4 scheduling and operator-recorded completion only; no external work-order dispatch or payment.';
COMMENT ON TABLE asset_os.insurance_policies IS
 'User-entered policy references, not evidence of underwriter coverage, verification or premium payment.';
COMMENT ON TABLE asset_os.utilization_readings IS
 'User-entered nondecreasing cumulative metric observations, not trusted telematics.';
COMMENT ON TABLE asset_os.document_references IS
 'Opaque metadata labels only; no documents uploaded or external verification.';
COMMENT ON TABLE asset_os.location_events IS
 'User-entered coarse location labels only; no live tracking or GPS ingestion.';
COMMENT ON TABLE asset_os.asset_relationships IS
 'Tenant-scoped contextual relationships only, not legal or verified dependency proofs.';
