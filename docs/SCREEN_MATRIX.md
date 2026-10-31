# Asset OS — Screen Implementation Matrix

**Total:** 60 screens (60 principal product experiences). Phases 1–3 (Screens 01–30) are implemented as a frontend prototype; no backend, production data or Kernel integration is connected.

| Phase | Screen IDs | Feature area | Current status |
| --- | --- | --- | --- |
| 0 | Foundation | UI shell, design system, routing, CI and GitHub Pages | Implemented |
| 1 | 01–10 | Command Center, registry, asset details, add/edit, classification, tags, advanced search, activity, type-specific views | **Implemented (frontend-only)** |
| 2 | 11–20 | Acquisition center and wizard, acquisition details, cost basis, lifecycle, ownership center/details/transfer, disposition wizard and history | **Implemented (frontend-only)** |
| 3 | 21–30 | Draft/review valuations, history, financing terms and observations, income/expenses, cash flow, ROI and reconciliation | **Implemented (frontend-only)** |
| 4 | 31–40 | Maintenance, insurance and utilization | Planned |
| 5 | 41–50 | Portfolio, intelligence and risk | Planned |
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
