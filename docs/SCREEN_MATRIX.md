# Asset OS — Screen Implementation Matrix

**Total:** 60 screens (60 principal product experiences). Phases 1–5 (Screens 01–50) are implemented as a frontend prototype; no backend, production data or Kernel integration is connected.

| Phase | Screen IDs | Feature area | Current status |
| --- | --- | --- | --- |
| 0 | Foundation | UI shell, design system, routing, CI and GitHub Pages | Implemented |
| 1 | 01–10 | Command Center, registry, asset details, add/edit, classification, tags, advanced search, activity, type-specific views | **Implemented (frontend-only)** |
| 2 | 11–20 | Acquisition center and wizard, acquisition details, cost basis, lifecycle, ownership center/details/transfer, disposition wizard and history | **Implemented (frontend-only)** |
| 3 | 21–30 | Draft/review valuations, history, financing terms and observations, income/expenses, cash flow, ROI and reconciliation | **Implemented (frontend-only)** |
| 4 | 31–40 | Maintenance plans/jobs, insurance and renewals, utilization, evidence, locations, relationships and operational calendar | **Implemented (frontend-only)** |
| 5 | 41–50 | Portfolio directory/details, allocation, comparison, performance, assessed risk, watchlist, scenario sensitivities and guided intelligence | **Implemented (frontend-only)** |
| 6 | 51–60 | Kernel integration and administration | Planned |
| 7 | All | Cross-role and responsive experience certification | Planned |

## Phase 1 route map

| ID | Screen | Route |
| --- | --- | --- |
| 01 | Asset Command Center | `#/dashboard` |
| 02 | My Assets — Registry | `#/assets` |
| 03 | Asset Details — Overview | `#/asset/:id` |
| 04 | Create Asset | `#/assets/new` |
| 05 | Edit Asset | `#/asset/:id/edit` |
| 06 | Classification Directory | `#/classifications` |
| 07 | Asset Tags and Collections | `#/tags` |
| 08 | Advanced Asset Search | `#/search` |
| 09 | Asset Activity Timeline | `#/activity` |
| 10 | Asset-Specific Detail Views | `#/type-views` and `#/asset/:id/type` |


## Phase 2 route map

| ID | Screen | Route |
| --- | --- | --- |
| 11 | Acquisition Center | `#/acquisitions` |
| 12 | Asset Acquisition Wizard | `#/acquisitions/new` |
| 13 | Acquisition Record | `#/acquisitions/:assetId` |
| 14 | Cost Basis Breakdown | `#/cost-basis`, `#/cost-basis/:assetId` |
| 15 | Lifecycle Manager | `#/lifecycle` |
| 16 | Ownership Center | `#/ownership` |
| 17 | Ownership Details | `#/ownership/:assetId` |
| 18 | Assign / Transfer Ownership | `#/ownership/manage/:assetId` |
| 19 | Disposal Wizard | `#/dispose/:assetId` |
| 20 | Disposition & Archive History | `#/dispositions`, `#/dispositions/:assetId` |

### Phase 2 acceptance requirements

- Preserve existing Phase 1 browser data when upgrading v1 → v2.
- Enforce planned → acquisition pending → acquired → active; active ↔ suspended; acquired/active/suspended → disposed → archived.
- Show all forbidden lifecycle operations as blocked, rather than mutating state.
- Record append-style acquisition cost components and effective dates.
- Avoid fabricated cost basis or ownership provenance on seeded sample assets.
- Restrict economic/beneficial ownership allocations to at most 100% and require transfer from an existing active interest.
- Preserve transfer history and effective-dated ownership snapshots.
- Require explicit `DISPOSE` confirmation and prevent duplicate disposition or reactivation.
- Preserve asset registry, acquisition and ownership histories after disposition and archive.
- Update KES dashboard held-value projections to exclude disposed/archived assets without deleting historical asset records.
- Keep browser-only and no-Kernel-authority labels visible throughout all workflows.

## Phase 3 route map

| ID | Screen | Route |
| --- | --- | --- |
| 21 | Valuation Center | `#/valuations` |
| 22 | Valuation Details and Evidence | `#/valuations/:valuationId` |
| 23 | Record or Review Valuation | `#/valuations/new` (draft) and `#/valuations/:valuationId` (review) |
| 24 | Valuation History and Trends | `#/valuation-history` |
| 25 | Financing Center | `#/financing` |
| 26 | Financing Details and Balance History | `#/financing/:facilityId` |
| 27 | Asset Income and Expenses | `#/income-expenses` |
| 28 | Cash Flow and Yield Analysis | `#/cash-flow` |
| 29 | Equity, ROI and Performance | `#/economics` |
| 30 | Finance Reconciliation | `#/reconciliation` |

### Phase 3 acceptance requirements

- Preserve existing Phase 1–2 browser records through v1/v2 → v3 schema migration.
- Record append-only valuation drafts; local acceptance updates the registry value and preserves superseded evidence.
- Never claim external valuation acceptance, create synthetic valuation histories or perform silent FX conversion.
- Store original financing facility terms separately from dated, manual outstanding-balance observations.
- Derive indicative equity from observed balances only when all facility balances exist; never equate principal with current debt.
- Keep operating income/expense, capital outlays and financing flows distinct. Aggregate by asset, date and currency.
- Display empty states for real valuation/flow charts until users enter records; no synthetic financial return metrics.
- Compute simple operating cash-on-cost only if a recorded acquisition cost basis exists; avoid portraying it as accounting ROI, IRR or tax basis.
- Attach external transaction references without asserting a verified match or triggering payments.
- Respect disposed and archived lifecycle guards; no financial-entry commands allowed after exit.
- Maintain the premium dark UI, connected contextual navigation and responsive states.

## Phase 4 screen contracts

| Screen | Route | Primary behavior |
| --- | --- | --- |
| 31 Maintenance Center | `#/maintenance` | Overview of plans, due dates, service jobs and navigable workflows |
| 32 Maintenance Plans | `#/maintenance/plans` | Create, pause/resume recurring schedules; deterministic next-due calculation |
| 33 Maintenance Events / Work Orders | `#/maintenance/jobs` | Schedule/start/cancel/complete jobs; completion cost stays off Finance OS |
| 34 Insurance Center | `#/insurance` | List manually entered coverage references; determine date-based expiry |
| 35 Insurance Policy Detail / Renewal | `#/insurance/policies/:id`, `#/insurance/new` | Policy history, cancel and superseding renewal records |
| 36 Utilization Dashboard | `#/utilization` | Enter cumulative manual readings by asset and metric |
| 37 Utilization Detail | `#/utilization/:assetId` | Observed source, chronological totals and deltas (no fabricated telemetry) |
| 38 Documents & Evidence References | `#/evidence` | Metadata-only references and expiry dates; no document upload |
| 39 Locations & Asset Relationships | `#/locations` | Effective-dated location changes and cycle-safe asset relation graph |
| 40 Operational Calendar | `#/operations-calendar` | Read-only timeline of recorded service due/scheduled dates and expiries |

### Phase 4 acceptance rules

- Preserve v1/v2/v3 browser snapshots through v4 migration and maintain all phase histories.
- Only acquired, active and suspended assets accept new operational commands.
- Maintenance recurrences support DAYS, WEEKS and MONTHS, with robust month-end handling; pausing plans disables due projections.
- Service job completion is terminal and records a local unposted cost; advancing a plan's due date preserves history.
- Insurance coverage is a *user-entered reference* and is never called verified or legally accepted.
- Renewal creates a new policy record and preserves the superseded record; cancellation does not notify insurers.
- Utilization readings are effective-dated, cumulative, monotonic for each metric, and manually sourced; no fake telemetry, occupancy-rate or efficiency trend.
- Evidence is metadata-only: no binary file, URL, policy secret, title document or secure-file claim.
- Location changes are effective-dated with a previous-label history; generic asset edits cannot overwrite a recorded location change.
- Component and dependency relations cannot be circular or self-referential.
- Calendar only derives actual recorded operational dates, excludes disposed/archived assets from active reminders, and cannot change Human Kernel schedule authority.
- No automatic Finance OS expense/payment, Mission OS tasks, third-party work order dispatch or calendar notification.

## Phase 5 route and acceptance map

| Screen | Route | Functional obligation |
| --- | --- | --- |
| 41 Portfolio Directory | `#/portfolios` | Create same-currency analytical groups; no synthetic portfolios |
| 42 Portfolio Details | `#/portfolio/:id` | Add/remove member assets with membership history; never change legal ownership |
| 43 Asset Allocation | `#/allocation` | Category/location/lifecycle/risk-label shares, same currency only |
| 44 Asset Comparison | `#/comparison` | Select 2–4 assets; display differences and unknown inputs without FX |
| 45 Performance Center | `#/performance` | Recorded income/expense, operating cash-on-cost, coverage and source limitations |
| 46 Risk Management | `#/risk-center` | Assessments and explicit rule-derived operational signals |
| 47 Risk Assessment | `#/risk/:id`, `#/risk/new` | Five self-reported weighted dimensions, source, rationale and effective-dated history |
| 48 Underperforming | `#/underperforming` | Evidence-based negative cash flow, below-basis reviewed values, stale valuations, risk and maintenance flags |
| 49 Forecasting & Scenarios | `#/scenarios` | One-period deterministic sensitivity; no probabilities or market-forecast claims |
| 50 Intelligence Assistant | `#/intelligence` | Guided rules-only Q&A, explainable sources, local decision notes; no connected model |

### Phase 5 release criteria

- Preserve existing v1–v4 local snapshots through a version 5 migration with original asset IDs and histories.
- Reject duplicate active portfolio memberships; retain removed memberships and archived groups as historical records.
- Never sum assets across different currencies, silently convert FX, or infer debt from original principal.
- Assets may appear in multiple portfolios: individual portfolio totals are not an authoritative consolidated net worth.
- Compute value shares from current held assets only; missing/zero total has an explicit empty state.
- Record risk dimension values in the range 1–5, effective date and rationale; normalize with visible fixed weights.
- Do not synthesize personal financial history, professional risk scores, accepted valuations, utilization or AI results.
- Derive watchlist signals only from observable entered cash flow, approved-local valuation, recorded basis, risk assessment and maintenance dates.
- Scenario calculations must clearly show baseline/current input values and simple shock arithmetic, without future claims.
- Intelligence assistant must identify itself as an offline guided rule explainer, not a connected AI model.
- No autonomous sales, trades, transfers, Finance OS ledger posting, Kernel tasks or high-impact user decisions.
- All ten screens navigable from the sidebar or roadmap, with empty, populated and error states.

## Functional acceptance

- Create and edit assets using validated forms; preserve immutable IDs and numbers.
- Store demo and locally created data in browser localStorage only; support explicit demo reset with confirmation.
- List, paginate, filter, sort and search assets; deep-link to asset detail.
- Categorize assets and create custom categories/subcategories (without changing system taxonomy).
- Create, rename, remove and assign tags with referential consistency across local assets.
- Display per-category specialized fields and a dedicated asset-type detail profile.
- Maintain a bounded local activity stream for edited/created assets; clearly disclose non-authoritative nature.
- Display dashboard KES value/equity derived from browser records without silently converting currencies.
- Keep synthetic trend, monthly revenue/expenses, alerts and activity examples identified as illustrative.
- Preserve visual reference, responsive sidebar, reusable components and GitHub Pages deployment.

## Explicit V1 boundaries

Browser localStorage is **not** secure storage, a server database, an immutable audit trail, authorization, legal ownership or a Finance OS ledger. Do not enter sensitive or confidential real-world data. Lifecycle, acquisition and ownership features are browser-only prototypes in Phase 2. Phase 3 valuations and economics are local calculations and draft acceptance, not independently certified appraisals, lending, payment posting, verified bank reconciliations, accounting ROI, or real tax calculations. Real payments, legally validated transfers, maintenance/insurance, risk and cross-engine integrations require dedicated authoritative backend flows.
