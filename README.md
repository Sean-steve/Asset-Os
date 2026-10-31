# Asset OS — Personal Kernel Asset Intelligence

**Status: Phase 0 — frontend foundation.** No production assets, identity, finance records or Kernel services are connected. Every number shown in the preview is **demo data**.

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

The project uses strict TypeScript, four built-in Node foundation checks and a Vite production build. Additional behavioral/end-to-end tests will follow screen implementation.

## GitHub Pages
The Vite deployment base is `/Asset-Os/`. The Actions workflow is `.github/workflows/pages.yml`.

**One-time GitHub setting:** In **Settings → Pages → Build and deployment**, select **Source: GitHub Actions**. The workflow builds and publishes on pushes to `main`.

Expected public URL after Pages has been enabled and a deployment succeeds:
https://sean-steve.github.io/Asset-Os/

A deployment workflow does not itself establish that a public site is live. Verify the deployment run and public URL.

## Product boundaries
Asset OS owns asset-domain state. Finance OS owns the posted financial ledger, and the Personal Kernel owns identity, authorization and orchestration. No external integration is simulated as real in Phase 0.

| Milestone | State |
| --- | --- |
| 0 — Foundation | Implemented UI; publishing needs Pages setup |
| 1 — Dashboard and registry (01–10) | Planned |
| 2 — Lifecycle, acquisition and ownership (11–20) | Planned |
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
