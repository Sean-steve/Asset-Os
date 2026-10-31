-- Asset OS B0 / 0002 — durable domain model. Monetary amounts are NUMERIC,
-- never IEEE-754 FLOAT, and never constitute a Finance OS ledger posting.
CREATE TABLE asset_os.acquisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  method text NOT NULL CHECK(method IN ('PURCHASE','TRANSFER','GIFT','INHERITANCE','CREATION','EXCHANGE','INVESTMENT','OTHER')),
  effective_on date NOT NULL,
  counterparty_label text NOT NULL DEFAULT '',
  evidence_reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,asset_id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.acquisition_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  acquisition_id uuid NOT NULL,
  component text NOT NULL CHECK(component IN ('purchase','taxes','fees','installation','improvements','other')),
  amount numeric(20,2) NOT NULL CHECK(amount >= 0),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,acquisition_id,component),
  FOREIGN KEY(tenant_id,acquisition_id) REFERENCES asset_os.acquisitions(tenant_id,id)
);
CREATE TABLE asset_os.ownership_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  party_ref text NOT NULL CHECK(length(party_ref) BETWEEN 1 AND 140),
  party_label text NOT NULL DEFAULT '',
  dimension text NOT NULL CHECK(dimension IN ('ECONOMIC','BENEFICIAL','LEGAL','CONTROL')),
  percentage numeric(5,2) CHECK(percentage BETWEEN 0 AND 100),
  effective_from date NOT NULL,
  effective_to date,
  source text NOT NULL CHECK(source IN ('ASSIGNMENT','TRANSFER')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  CHECK(effective_to IS NULL OR effective_to>=effective_from),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE INDEX idx_interests_current ON asset_os.ownership_interests(tenant_id,asset_id,dimension,effective_to);
CREATE TABLE asset_os.ownership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  change_kind text NOT NULL CHECK(change_kind IN ('ASSIGNMENT','TRANSFER')),
  dimension text NOT NULL CHECK(dimension IN ('ECONOMIC','BENEFICIAL','LEGAL','CONTROL')),
  from_party_ref text,
  to_party_ref text NOT NULL,
  percentage numeric(5,2) CHECK(percentage BETWEEN 0 AND 100),
  effective_on date NOT NULL,
  note text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('SALE','TRANSFER','DONATION','WRITE_OFF','DESTRUCTION','TRADE','OTHER')),
  effective_on date NOT NULL,
  proceeds numeric(20,2) NOT NULL CHECK(proceeds >= 0),
  costs numeric(20,2) NOT NULL CHECK(costs >= 0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  counterparty_label text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,asset_id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  effective_on date NOT NULL,
  amount numeric(20,2) NOT NULL CHECK(amount >= 0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  method text NOT NULL CHECK(method IN ('MARKET_COMPARABLES','INCOME_APPROACH','COST_APPROACH','BROKER_STATEMENT','APPRAISAL','MANUAL_ESTIMATE')),
  confidence text NOT NULL CHECK(confidence IN ('LOW','MEDIUM','HIGH')),
  source_label text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACCEPTED','SUPERSEDED')),
  accepted_at timestamptz,
  supersedes_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  CHECK(status <> 'ACCEPTED' OR accepted_at IS NOT NULL),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id),
  FOREIGN KEY(tenant_id,supersedes_id) REFERENCES asset_os.valuations(tenant_id,id)
);
CREATE INDEX idx_valuations_asset_history ON asset_os.valuations(tenant_id,asset_id,effective_on DESC);
CREATE TABLE asset_os.financing_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  financier_label text NOT NULL,
  original_principal numeric(20,2) NOT NULL CHECK(original_principal>=0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  interest_rate_pct numeric(8,4) NOT NULL CHECK(interest_rate_pct BETWEEN 0 AND 1000),
  started_on date NOT NULL,
  matures_on date,
  frequency text NOT NULL CHECK(frequency IN ('MONTHLY','QUARTERLY','ANNUALLY','OTHER')),
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  CHECK(matures_on IS NULL OR matures_on>=started_on),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.financing_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  facility_id uuid NOT NULL,
  observed_on date NOT NULL,
  outstanding numeric(20,2) NOT NULL CHECK(outstanding>=0),
  source_label text NOT NULL CHECK(length(source_label)>0),
  notes text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,facility_id,observed_on),
  FOREIGN KEY(tenant_id,facility_id) REFERENCES asset_os.financing_facilities(tenant_id,id)
);
CREATE INDEX idx_financing_observations ON asset_os.financing_balances(tenant_id,facility_id,observed_on DESC);
CREATE TABLE asset_os.cash_flow_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('INCOME','EXPENSE','CAPEX','FINANCING_INFLOW','FINANCING_OUTFLOW')),
  category text NOT NULL,
  amount numeric(20,2) NOT NULL CHECK(amount>=0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  occurred_on date NOT NULL,
  counterparty_label text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  source_authority text NOT NULL DEFAULT 'USER_ENTRY' CHECK(source_authority IN ('USER_ENTRY','FINANCE_OS_PROJECTION')),
  source_event_id text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE INDEX idx_flows_asset_date ON asset_os.cash_flow_observations(tenant_id,asset_id,occurred_on DESC);
CREATE UNIQUE INDEX uq_finance_event_per_tenant ON asset_os.cash_flow_observations(tenant_id,source_event_id)
  WHERE source_event_id IS NOT NULL AND source_authority='FINANCE_OS_PROJECTION';
CREATE TABLE asset_os.reconciliation_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  flow_id uuid NOT NULL,
  system text NOT NULL CHECK(system IN ('FINANCE_OS','BANK','OTHER')),
  external_reference text NOT NULL,
  note text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,flow_id) REFERENCES asset_os.cash_flow_observations(tenant_id,id)
);
CREATE TABLE asset_os.maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  interval_value integer NOT NULL CHECK(interval_value BETWEEN 1 AND 3650),
  interval_unit text NOT NULL CHECK(interval_unit IN ('DAYS','WEEKS','MONTHS')),
  next_due date NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED')),
  last_completed_on date,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE INDEX idx_plan_calendar ON asset_os.maintenance_plans(tenant_id,status,next_due);
CREATE TABLE asset_os.service_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  plan_id uuid,
  title text NOT NULL,
  scheduled_for date NOT NULL,
  provider_label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
  notes text NOT NULL DEFAULT '',
  completed_on date,
  recorded_cost numeric(20,2) CHECK(recorded_cost>=0),
  completion_notes text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id),
  FOREIGN KEY(tenant_id,plan_id) REFERENCES asset_os.maintenance_plans(tenant_id,id)
);
CREATE TABLE asset_os.insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  insurer_label text NOT NULL,
  policy_reference text NOT NULL DEFAULT '',
  policy_type text NOT NULL,
  start_on date NOT NULL,
  end_on date NOT NULL,
  coverage_amount numeric(20,2) NOT NULL CHECK(coverage_amount>=0),
  premium_amount numeric(20,2) CHECK(premium_amount>=0),
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'RECORDED' CHECK(status IN ('RECORDED','SUPERSEDED','CANCELLED')),
  replaces_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  CHECK(end_on>=start_on),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id),
  FOREIGN KEY(tenant_id,replaces_id) REFERENCES asset_os.insurance_policies(tenant_id,id)
);
CREATE INDEX idx_policy_expiry ON asset_os.insurance_policies(tenant_id,end_on,status);
CREATE TABLE asset_os.utilization_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  metric text NOT NULL CHECK(metric IN ('ODOMETER_KM','HOURS_TOTAL','USE_COUNT','OCCUPIED_DAYS')),
  observed_on date NOT NULL,
  reading numeric(20,2) NOT NULL CHECK(reading>=0),
  source_label text NOT NULL,
  notes text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,asset_id,metric,observed_on),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.document_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('INSURANCE','MAINTENANCE','OWNERSHIP','COMPLIANCE','VALUATION','OTHER')),
  title text NOT NULL,
  opaque_reference text NOT NULL,
  issued_on date,
  expires_on date,
  notes text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  CHECK(expires_on IS NULL OR issued_on IS NULL OR expires_on>=issued_on),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.location_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  from_label text NOT NULL DEFAULT '',
  to_label text NOT NULL,
  effective_on date NOT NULL,
  reason text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.asset_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  related_asset_id uuid NOT NULL,
  relation text NOT NULL CHECK(relation IN ('ASSOCIATED_WITH','COMPONENT_OF','DEPENDS_ON','LOCATED_WITH')),
  note text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  CHECK(asset_id<>related_asset_id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id),
  FOREIGN KEY(tenant_id,related_asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE TABLE asset_os.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE(tenant_id,id)
);
CREATE TABLE asset_os.portfolio_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  portfolio_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_at timestamptz,
  UNIQUE(tenant_id,id),
  CHECK(removed_at IS NULL OR removed_at>=added_at),
  FOREIGN KEY(tenant_id,portfolio_id) REFERENCES asset_os.portfolios(tenant_id,id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE UNIQUE INDEX uq_portfolio_active_membership ON asset_os.portfolio_memberships(tenant_id,portfolio_id,asset_id) WHERE removed_at IS NULL;
CREATE TABLE asset_os.risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid NOT NULL,
  observed_on date NOT NULL,
  market smallint NOT NULL CHECK(market BETWEEN 1 AND 5),
  liquidity smallint NOT NULL CHECK(liquidity BETWEEN 1 AND 5),
  condition smallint NOT NULL CHECK(condition BETWEEN 1 AND 5),
  regulatory smallint NOT NULL CHECK(regulatory BETWEEN 1 AND 5),
  counterparty smallint NOT NULL CHECK(counterparty BETWEEN 1 AND 5),
  source_label text NOT NULL,
  rationale text NOT NULL CHECK(length(rationale)>0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
CREATE INDEX idx_risk_history ON asset_os.risk_assessments(tenant_id,asset_id,observed_on DESC);
CREATE TABLE asset_os.scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  portfolio_id uuid,
  name text NOT NULL,
  currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  value_shock_pct numeric(9,4) NOT NULL CHECK(value_shock_pct BETWEEN -100 AND 500),
  income_shock_pct numeric(9,4) NOT NULL CHECK(income_shock_pct BETWEEN -100 AND 500),
  expense_shock_pct numeric(9,4) NOT NULL CHECK(expense_shock_pct BETWEEN -100 AND 500),
  assumptions text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,portfolio_id) REFERENCES asset_os.portfolios(tenant_id,id)
);
CREATE TABLE asset_os.intelligence_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES asset_os.tenants(id),
  asset_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,asset_id) REFERENCES asset_os.assets(tenant_id,id)
);
