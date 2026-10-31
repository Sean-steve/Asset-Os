# Asset OS — Personal Kernel Asset Intelligence

**Frontend: Phase 7 certified — 60/60 screen experiences. Backend: Phase B1 verified OIDC/tenant membership and PostgreSQL Asset Registry API implemented (provider credentials not configured).** This is a browser-local prototype, not a production backend. Five starter assets are clearly illustrative; user-entered asset, ownership, finance, operation and portfolio changes persist in local browser storage only. Dashboard valuation history and operational alerts now derive only from recorded data, with honest empty states rather than synthetic activity.

## Phase B1.1 — Secure Registry Frontend Integration (provider activation pending)

The application now has a **separate protected Server Registry** at `#/server-registry` for public-client OIDC Authorization Code + PKCE sign-in, tenant membership verification and PostgreSQL-backed asset list/create/detail/edit. Access tokens remain in memory. All other 60 frontend screens are **browser-local previews**, not synchronized server records. With no real identity provider and API configured, the server registry correctly displays **not activated**.

Deployment reads public configuration from GitHub Pages variables; **no OIDC secret or access token belongs in repository variables or client files**. The backend has an exact-origin CORS allowlist. [B1.1 activation guide](docs/BACKEND_B1_1.md) provides configuration and live staging certification requirements.

## Phase B1 — Trusted Identity & PostgreSQL Asset Registry

Backend B1 implements an **OIDC/JWKS RS256-verifying** identity boundary and tenant role authorization in the same PostgreSQL transaction as registry commands. It includes a privileged, signed-access-token-based first-owner bootstrap; `GET /v1/me`; `GET/POST /v1/assets`; `GET/PATCH /v1/assets/:id`; immutable asset ID/currency/lifecycle from client edits; strong ETag concurrency; 24-hour idempotency keys; minimum-necessary audit and atomic outbox events. All future domain routes remain blocked.

**An actual Personal Kernel or OIDC issuer is not yet configured; the public GitHub Pages frontend remains disconnected.** Until operator-supplied issuer, audience and JWKS are configured and a verified owner is enrolled, all authenticated registry routes fail closed. Do not import illustrative localStorage samples into a real tenant.

For architecture, identity proofing requirements, bootstrap commands and real PostgreSQL test evidence, see [B1 Backend Integration Guide](docs/BACKEND_B1.md).

## Phase B0 — PostgreSQL backend and API contracts (31 October 2026)

A separate **Fastify + TypeScript** service now lives in `apps/api`, with three PostgreSQL 16 migrations, forced tenant row-level security, restricted runtime/database-migration credentials, cross-tenant foreign keys, append-only runtime audit storage, outbox/inbox event structures, idempotency tables and a versioned OpenAPI 3.1 contract.

**This is backend foundation only.** The hosted frontend still stores records locally and is **not** connected to PostgreSQL. The new API currently implements liveness, readiness, capability metadata and OpenAPI. All domain CRUD deliberately returns HTTP 503 `IDENTITY_NOT_CONFIGURED` until trusted Personal Kernel identity, tenancy and authorization are available in B1.

- [Backend architecture, schema, security boundaries and local setup](docs/BACKEND_B0.md)
- [OpenAPI v3.1 contract](apps/api/openapi/openapi.json) and [cross-OS event contracts](apps/api/openapi/events.json)
- [Backend PostgreSQL certification workflow](.github/workflows/backend-b0.yml)

Local test database and API can be started after configuring **private** development credentials:

```bash
cp infra/.env.example infra/.env
# Replace placeholder passwords in infra/.env (not committed).
docker compose --env-file infra/.env -f infra/docker-compose.yml up --build -d
curl http://127.0.0.1:3001/health/ready
```

Next: **B1 — authenticated tenant/subject binding and server-authoritative Asset Registry**. Never import synthetic/localStorage records as trusted production holdings without explicit review and an authenticated migration.

## Phase 7 frontend release certification — 31 October 2026

- **116/116 automated Node domain/regression tests passed**, including v1–v5 storage migration into v6 and financial/authority boundaries.
- **142/142 Chromium browser tests passed** in desktop and mobile profiles, including 120 screen-navigation checks, hash-route reloads, responsiveness at 390/768/1440 pixels, keyboard navigation and cross-phase workflows.
- Browser tests run against the actual `/Asset-Os/` production Vite preview. GitHub Actions retains the browser report, test screenshots/video on failure and Playwright traces.
- Portfolio/category charts include user-created asset categories and exclude unknown financing balances from known-equity totals.
- See [Phase 7 Certification Report](docs/PHASE_7_CERTIFICATION.md) and the [GitHub Actions checks](https://github.com/Sean-steve/Asset-Os/actions) for traceable evidence.

**Not included in the certified frontend:** production identity, connected backend/data authority, authenticated Finance/Wealth/Kernel integrations, real notifications, secure document storage, external AI, cross-browser visual review or a full WCAG audit. These require separate backend and preproduction work.

To run the browser gate locally, first install Chromium dependencies compatible with your OS and then run:

```bash
npm install
npx playwright install chromium
npm run build
npm run test:e2e
```

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

## Phase 5 — portfolio, performance and explainable intelligence

**Screens 41–50** are implemented as navigable, browser-local, responsive React experiences. There is no production AI integration and no autonomous financial/ownership action.

| ID | Experience | Hash routes |
| --- | --- | --- |
| 41 | Portfolio Directory | `#/portfolios` |
| 42 | Portfolio Details & Membership | `#/portfolio/:portfolioId` |
| 43 | Asset Allocation & Concentration | `#/allocation` |
| 44 | Asset Comparison | `#/comparison` |
| 45 | Performance Intelligence Center | `#/performance` |
| 46 | Risk Management Center | `#/risk-center` |
| 47 | Risk Assessment Details & Entry | `#/risk/:assetId`, `#/risk/new` |
| 48 | Underperforming Assets | `#/underperforming` |
| 49 | Forecasting & Scenario Analysis | `#/scenarios` |
| 50 | Asset Intelligence Assistant | `#/intelligence` |

### Key workflows

1. Create a portfolio in one ISO currency. Add only currently held assets of that currency. Adding and removing assets changes *analytical membership*, not ownership.
2. Inspect held-asset value, indicative equity completeness, categorized allocation and largest holding concentration. Portfolio totals must not be added together if memberships overlap.
3. Compare two–four assets with comparable metrics. Mixed currency is surfaced explicitly; the UI never makes an implicit FX conversion or fake performance ranking.
4. Record effective-dated risk scores across market (30%), liquidity (25%), condition (20%), regulatory (15%) and counterparty (10%) dimensions. Document source and rationale. Existing asset risk labels are **not** converted to fabricated assessments.
5. Review evidence-derived watchlist signals: negative manually recorded operating cash flow, locally accepted valuation below acquisition cost, stale accepted valuations, high manually assessed risk or overdue entered maintenance plan. No-data is **not** positive performance.
6. Change one-period scenario sensitivities for current value, existing entered income and expenses. Inputs are saved locally. Results are not forecasts, probabilities, IRR, investment advice or projected time series.
7. Ask the rules-based intelligence assistant questions about stored facts, and save decision notes. There is no connected generative AI model, external financial data, autonomous decisions, task dispatch or payment execution.

### Data and safety

- The localStorage snapshot evolves from schema v4 to **v5** using the same existing storage key. Versions v1–v4 migrate without deleting registry, lifecycle, finance or operational histories.
- New domain module: `src/intelligence/core.ts`. UI: `src/intelligence/IntelligenceExperience.tsx` and `src/intelligence/intelligence.css`. Tests: `tests/intelligence.test.mjs`.
- The prototype is untrusted browser-local state, not a secure multi-tenant backend. Do not enter sensitive financial accounts, identity documents, passwords or actual private ownership/insurance data.
- Actual governed intelligence, Wealth OS projection authority, Kernel identity, audit, permissions, real forecasting and production certification remain future work.

## Phase 6 — Kernel Integration & Administration (Screens 51–60)

All **60 / 60 primary frontend screens** now have navigable experiences. Phase 6 establishes **safe client-side projections and non-authoritative integration contracts**, NOT functioning secure identity or cross-engine services.

| ID | Screen | Hash route | Present functionality |
| --- | --- | --- | --- |
| 51 | Net Worth & Wealth OS Interface | `#/wealth-interface` | Per-currency held-asset value, observed debt, incomplete-debt state and **never-transmitted** Wealth handoff preview |
| 52 | Personal Kernel Action Center | `#/kernel-actions` | Derive candidates from real operational dates; draft, review or dismiss *local-only* proposals |
| 53 | Notifications & Reminders | `#/notifications` | Derive local alerts, acknowledge, snooze and reset; no background delivery |
| 54 | Reports & Exports | `#/reports` | Preview/locally export narrow CSV summaries; formula-safe cell escaping and field allowlists |
| 55 | Integration Hub | `#/integrations` | Six documented contracts, all **NOT CONNECTED** |
| 56 | Integration Connection Details | `#/integrations/:SYSTEM_ID` | Authority/direction/prerequisite review, record/withdraw a planning intent; no OAuth, credentials or handshake |
| 57 | Team & Access Management | `#/team-access` | Four *design-preview* role profiles and abilities; no user invitations, sessions or enforced authorization |
| 58 | Security & Audit Center | `#/security-audit` | Search/filter local event history with explicit warning it is mutable and **not** a security audit log |
| 59 | Workspace Settings | `#/settings` | Browser reporting-currency preference, local reminder horizon, display-role preview, reminders and onboarding preferences |
| 60 | Onboarding & Empty-State Experience | `#/onboarding` | Progress checklist from user-entered facts, not synthetic data |

### Phase 6 workflows

1. Inspect the Wealth preview. The report is single-currency and counts only held assets. Unknown facility balances yield **unknown indicative net equity**; missing external obligations and assets prevent claiming consolidated net worth. The JSON contract is not sent to Wealth OS.
2. From a maintenance, service, insurance or evidence date, create a **local Kernel proposal**; mark it reviewed/dismissed. Never mutate Personal Kernel scheduling, create Mission OS tasks or send provider requests.
3. Review local reminder cards (within selected 7/30/90 day horizon plus overdue), acknowledge or snooze. The header badge is computed from actual unread local records; no fixed demo count.
4. Preview a minimal asset, operations or portfolio report and download a formula-safe CSV, explicitly excluding owner data, evidence references, policy references and sensitive details. Exports are locally generated in the browser, not server-authorized.
5. Inspect contracts for **Personal Kernel, Wealth OS, Finance OS, Mission OS, Knowledge OS and Notifications**. All show *NOT CONNECTED*. Recording a planning intent never authorizes a network connection.
6. Inspect future workspace roles. A selected preview role is **not** an actual logged-in user, access grant, route gate, object authorization or secure-team invitation.
7. Review local activity and safety requirements, adjust browser preferences and use the onboarding checklist. Progress reflects only user-entered records; starter sample assets do not count.

### Data safety and migration

- Schema v6 extends `RegistryState` with `phase6` local settings, integration-planning notes, local action drafts and alert preferences.
- v1–v5 browser snapshots migrate to v6 with Phase 1–5 asset IDs, acquisition/ownership history, valuations, financing, operations and portfolio/intelligence records preserved.
- Existing localStorage key is retained; this does not make it encrypted or access-controlled. There are **no real credentials, login sessions, tenant identities, external events, server financial ledgers, push/email/SMS delivery, secure exports or append-only audit logs**.
- Source: `src/governance/core.ts`, `src/governance/GovernanceExperience.tsx`, `src/governance/governance.css`; verification: `tests/governance.test.mjs`.

**Delivery boundary:** 60/60 **frontend screen experiences** is not production-grade Asset OS completion. Backend authority, Personal Kernel identity binding, persistent database, secure provider adapters, governance enforcement, real AI/forecasting and full browser/end-to-end certification remain outstanding. Phase 7 will focus on frontend certification; backend development is separate.

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
| 5 — Portfolio and intelligence (41–50) | **Implemented (frontend-only)** |
| 6 — Kernel integration and administration (51–60) | **Implemented (frontend-only; integrations disconnected)** |
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

- `src/intelligence/core.ts` — currency-safe portfolio aggregates, risk scoring, rule-based signals, sensitivity and decision-note commands
- `src/intelligence/IntelligenceExperience.tsx` — Screens 41–50 in the shared premium UI
- `src/intelligence/intelligence.css` — responsive Phase 5 visual components
- `tests/intelligence.test.mjs` — provenance, migrations, safety and formula regression tests

- `src/governance/core.ts` — read-only Wealth handoff, kernel proposal drafts, local alerts, export-safe reports, planning intents, design roles and onboarding contracts
- `src/governance/GovernanceExperience.tsx` — Phase 6 screens 51–60
- `src/governance/governance.css` — premium responsive Phase 6 visual system
- `tests/governance.test.mjs` — cross-phase migration, financial safety and non-authority regression tests
