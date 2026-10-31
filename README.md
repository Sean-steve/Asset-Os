# Asset OS — Personal Kernel Asset Intelligence

**Status: Phase 2 — Lifecycle, Acquisition & Ownership frontend implemented.** No production assets, identity, finance records or Kernel services are connected. The five starter assets are synthetic. New edits, acquisition, ownership and disposition records are stored only in your browser. Income/expenses, trend lines and alerts remain **demo data**.

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
| 3 — Valuation and economics (21–30) | Planned |
| 4 — Operations and protection (31–40) | Planned |
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
