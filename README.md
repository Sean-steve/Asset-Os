# Asset OS — Personal Kernel Asset Intelligence

**Status: Phase 4 — Maintenance, Insurance & Operations frontend implemented.** No production assets, identity, finance records or Kernel services are connected. The five starter assets are synthetic. New edits, acquisition, ownership and disposition records are stored only in your browser. Income/expenses now derive from manually entered browser records; trend lines and alerts remain **demo data**.

## Stack
- React 19 + TypeScript
- Vite 7 + Tailwind CSS 4 + custom design tokens
- Lucide icon library
- Local hash routing compatible with GitHub Pages
- GitHub Actions validation and Pages publishing

## Develop locally
Node.js 22 or later is recommended.

```bash
npm install
npm run dev
```

The app prints its local Vite address. Explore the foundation dashboard, design system and explicit 60-screen implementation roadmap.

## Validate
```bash
npm run test
npm run typecheck
npm run build
npm run preview
```

The project uses strict TypeScript, Node-native domain tests, foundation checks and a Vite production build. Cross-browser E2E testing remains part of Phase 7 certification.

## Phase 1 — browser-local workflows

The main screens are available at `#/dashboard`, `#/assets`, `#/assets/new`, `#/classifications`, `#/tags`, `#/search`, `#/activity`, and `#/type-views`. Asset-specific routes are `#/asset/:id`, `#/asset/:id/edit`, and `#/asset/:id/type`.

- Create/edit assets, classify them, manage tags, inspect detailed category information, filter and search, and view local activity.
- Data is persisted in browser localStorage. No server synchronization, secure identities, authoritative valuations, transaction ledger, or cross-user isolation exists.
- KES dashboard value and equity totals update from local assets. Other-currency assets are never converted silently.
- The demo reset control deliberately requires confirmation and overwrites current browser records.
- Financial trend, income, expenses and attention alerts are clearly labeled illustrative placeholders for later phases.
- Do **not** put real confidential personal, legal, financial or ownership documents into this public prototype.

## Phase 2 — lifecycle, acquisition, ownership and disposition

The following ten experiences are implemented in the frontend:

- **11 Acquisition Center:** `#/acquisitions`
- **12 Acquisition Wizard:** `#/acquisitions/new`
- **13 Acquisition Record:** `#/acquisitions/:assetId`
- **14 Cost Basis Breakdown:** `#/cost-basis` and `#/cost-basis/:assetId`
- **15 Asset Lifecycle Manager:** `#/lifecycle`
- **16 Ownership Center:** `#/ownership`
- **17 Ownership Details:** `#/ownership/:assetId`
- **18 Assign / Transfer Interests:** `#/ownership/manage/:assetId`
- **19 Asset Disposition Wizard:** `#/dispose/:assetId`
- **20 Dispositions & Archive History:** `#/dispositions` and `#/dispositions/:assetId`

### Recommended hands-on journey

1. Create a new asset in `#/assets/new`. It starts **PLANNED**.
2. Open `#/acquisitions/new` and select it. Begin acquisition (moves to **ACQUISITION_PENDING**).
3. Enter method/date/cost components and record acquisition (moves to **ACQUIRED**).
4. Open ownership to assign an economic share, legal right or beneficial interest. Use the transfer tab to reallocate recorded economic/beneficial interests with an effective date.
5. Open `#/lifecycle` to activate the acquired asset (**ACTIVE**) or suspend/reactivate it.
6. Open `#/dispose/:id`, enter the required information and type `DISPOSE`. This moves the asset to **DISPOSED**.
7. Open its preserved disposition record and archive it (**ARCHIVED**). Archived assets have no outgoing transitions.

Acquisition and ownership histories are represented separately from mutable asset registry fields. The storage schema upgrades existing Phase 1 browser records to version 2 at load time, keeping the **same** `asset-os:registry:v1` storage key for backward-compatible migration. Future writes save the extended version 2 snapshot atomically as one browser storage item. No sample acquisition or verified ownership is fabricated for the five seeded assets.

**Safety boundary:** No legal transfer, financing, tax basis certification, real payout, accounting posting, Kernel authority, signatures, external document storage or server audit happens here. Economic and beneficial allocations are limited to 100% per asset/dimension. Legal/control are non-percentage rights references, not additive fractions. These rules are evaluated only in untrusted, editable browser storage and must be enforced again by the future backend.

## Phase 3 — valuation, financing and economics

Screens **21–30** now exist as connected, responsive browser-only workflows:

| ID | Screen | Hash route |
| --- | --- | --- |
| 21 | Valuation Center | `#/valuations` |
| 22 | Valuation Details and Evidence | `#/valuations/:valuationId` |
| 23 | Record or Review Valuation | `#/valuations/new` and `#/valuations/:valuationId` |
| 24 | Valuation History and Trends | `#/valuation-history` |
| 25 | Financing Center | `#/financing` (new facility form inside) |
| 26 | Financing Details and Balance History | `#/financing/:facilityId` |
| 27 | Asset Income and Expenses | `#/income-expenses` |
| 28 | Cash Flow and Yield Analysis | `#/cash-flow` |
| 29 | Equity, ROI and Performance | `#/economics` |
| 30 | Finance Reconciliation | `#/reconciliation` |

### Data entry and review workflow

1. Create and acquire an asset with Phase 1–2 screens, or inspect existing synthetic assets.
2. Record a valuation draft with source, method, confidence, amount and effective date. The registry value is unchanged until explicit local acceptance.
3. Review and locally accept the draft. Previous accepted valuations are preserved as superseded historical entries; an older draft cannot overwrite a newer accepted effective date.
4. Create financing terms, then record dated outstanding balance snapshots. Original principal is **not** treated as outstanding debt or a posted payment. Balances may exceed principal.
5. Record positive local income, expense, capital expenditure or financing flow entries, separated by type and currency.
6. Inspect currency-scoped cash flow by month and indicative equity / cash-on-cost results. Missing cost basis produces no ROI; missing financing balance observations produce no debt-based equity.
7. Attach external reference identifiers to cash-flow entries. **Reference attached does not mean verified or reconciled**; verification stays at zero until a real Finance OS adapter is available.

The browser snapshot is upgraded from schema v1/v2 to **v3** at load time, preserving the existing asset IDs, acquisition, ownership, lifecycle and activity records. The same browser storage key remains in use for backward-compatible migration.

The dashboard now uses manually entered cash flows for KES income and expenses (all-time); it no longer displays fabricated income/expense history. The trend illustration remains explicitly labeled. There is no FX conversion or aggregation across currencies.

**Security and financial authority:** The app is a static prototype using editable localStorage. It does not connect to a bank, lender, broker or Finance OS, establish property rights, compute taxes, certify ROI, post transactions, verify receipts or generate legal audit evidence. Do not enter private financial account data, passwords or real sensitive ownership records.

## Phase 4 — maintenance, insurance and asset operations

The next **10 connected frontend experiences (Screens 31–40)** are implemented with the existing premium UI/UX language.

| ID | Screen | Browser route |
| --- | --- | --- |
| 31 | Maintenance Center | `#/maintenance` |
| 32 | Maintenance Plans | `#/maintenance/plans` |
| 33 | Maintenance Events and Work Orders | `#/maintenance/jobs` |
| 34 | Insurance Center | `#/insurance` |
| 35 | Policy Details and Renewal | `#/insurance/policies/:policyId` and `#/insurance/new` |
| 36 | Asset Utilization Dashboard | `#/utilization` |
| 37 | Utilization Details and Readings | `#/utilization/:assetId` |
| 38 | Evidence & Documents References | `#/evidence` |
| 39 | Asset Locations & Relationships | `#/locations` |
| 40 | Operational Calendar | `#/operations-calendar` |

### Walkthrough

1. Open a previously acquired or active asset; select **Maintenance plans** or visit the Maintenance Center. Create a date-based recurrence schedule (days, weeks or months). Due reminders are computed from the entered date.
2. Create a one-time service job or select an active plan. Mark the job in progress, complete it with a dated note and manually entered cost. The plan's next-due date advances after a completed job. Completion does **not** post a payment, service invoice or accepted inspection.
3. Record insurance metadata (reference, insurer label, coverage, effective and expiry dates), then view status according to the date. Record renewal as a new policy snapshot that retains the prior policy as superseded. Policy presence is **not** confirmation of coverage.
4. Record cumulative utilization readings for mileage, hours, uses or occupied days with explicit sources and dates. The detail profile shows true recorded observations and deltas, never synthetic telemetry or occupancy percentages.
5. Record **evidence metadata only**, not files; sensitive IDs, document contents, URLs and uploaded binaries are prohibited by the prototype. Issue/expiry dates appear in the operational calendar.
6. Record location changes with effective dates. The asset's current location updates, and the prior location remains preserved. Create informational relationships between assets; component and dependency cycles are rejected.
7. Open the Operational Calendar to inspect only user-entered maintenance due dates, scheduled jobs, policy expirations and evidence expirations. No Human Kernel, Mission OS, calendar sync, reminders or vendor actions are silently performed.

### Architecture and migration

- **Schema v4** extends `RegistryState` with `phase4` operational collections.
- Older v1, v2 and v3 browser snapshots are migrated when loaded, preserving asset IDs, lifecycle, ownership, valuation, financing, cash flow and prior activity.
- The existing browser storage key stays unchanged to prevent loss of previously saved local records.
- Source files: `src/operations/core.ts`, `src/operations/OperationsExperience.tsx`, `src/operations/operations.css`.
- Contract and migration verification: `tests/operations.test.mjs`, plus regression tests from earlier phases.

**Limitations:** This is a public static React preview. It has no backend, authentication, secure vault, telematics, insurer verification, payment processing, provider dispatch, real appointment scheduling or globally authoritative calendar. Avoid real private documents and personal financial information.

## GitHub Pages
The Vite deployment base is `/Asset-Os/`. The Actions workflow is `.github/workflows/pages.yml`.

**One-time GitHub setting:** In **Settings → Pages → Build and deployment**, select **Source: GitHub Actions**. The workflow builds and publishes on pushes to `main`.

Expected public URL after Pages has been enabled and a deployment succeeds:
https://sean-steve.github.io/Asset-Os/

A deployment workflow does not itself establish that a public site is live. Verify the deployment run and public URL.

## Product boundaries
Asset OS owns asset-domain state. Finance OS owns the posted financial ledger, and the Personal Kernel owns identity, authorization and orchestration. No external integration is simulated as real in Phase 0–2.

| Milestone | State |
| --- | --- |
| 0 — Foundation | Implemented and deployed |
| 1 — Dashboard and registry (01–10) | **Implemented (frontend-only)** |
| 2 — Lifecycle, acquisition and ownership (11–20) | **Implemented (frontend-only)** |
| 3 — Valuation, financing and economics (21–30) | **Implemented (frontend-only)** |
| 4 — Operations and protection (31–40) | **Implemented (frontend-only)** |
| 5 — Portfolio and intelligence (41–50) | Planned |
| 6 — Kernel integration and administration (51–60) | Planned |
| 7 — UI certification | Planned |

See [screen inventory](docs/SCREEN_MATRIX.md). A screen is complete only after its route, interactions, responsive states and tests exist; a placeholder does not count.

## Repository structure
- `src/App.tsx` — app shell, dashboard preview and component examples
- `src/styles.css` — design system and responsive styling
- `src/demo.ts` — local-only illustrative data
- `src/inventory.ts` — all 60 planned screens
- `tests/` — foundation verification
- `.github/workflows/ci.yml` — automated tests and build
- `.github/workflows/pages.yml` — Pages deployment

Do not commit credentials or personal runtime data to this public repository.

- `src/registry/core.ts` — browser-local registry domain, validation and storage
- `src/registry/RegistryExperience.tsx` — 10 connected Phase 1 screen experiences
- `src/registry/registry.css` — responsive Phase 1 styles
- `tests/registry.test.mjs` — registry behaviors and persistence unit tests

- `src/lifecycle/core.ts` — guarded browser-only acquisition, ownership, lifecycle and disposition domain operations
- `src/lifecycle/LifecycleExperience.tsx` — screens 11–20 and contextual workflows
- `src/lifecycle/lifecycle.css` — responsive Phase 2 presentation
- `tests/lifecycle.test.mjs` — migration, state machine, ownership, cost basis and disposition safety tests

- `src/economics/core.ts` — append-only valuations, facilities, observed debt, cash movements, indicative economics and reference-only reconciliation
- `src/economics/EconomicsExperience.tsx` — 10 Phase 3 screens and contextual actions
- `src/economics/economics.css` — responsive Phase 3 visual system
- `tests/economics.test.mjs` — Phase 3 financial-boundary, accuracy and migration checks

- `src/operations/core.ts` — maintenance, jobs, policies, readings, evidence references, locations, relations, derived calendar
- `src/operations/OperationsExperience.tsx` — connected Phase 4 screens 31–40
- `src/operations/operations.css` — responsive Phase 4 UI
- `tests/operations.test.mjs` — operational and persistence integrity regression tests
