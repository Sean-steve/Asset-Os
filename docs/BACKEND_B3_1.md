# Asset OS — B3.1: Verified Economics Frontend & Backend Integration

## Scope and trust boundary

B3.1 introduces **Secure Economics** at #/server-registry/economics and #/server-registry/asset/:assetId/economics. It is a distinct protected workspace under the existing B1.1 Authorization Code + PKCE and verified tenant membership. The original Phase 3 valuations, financing, cash flow, equity and reconciliation previews remain browser-local and must never be treated as authoritative tenant holdings.

No sample assets, localStorage financial data, browser-computed equity or unsecured source-specific credentials enter this workspace. If public OIDC/API runtime settings are missing, the existing gate reports Not configured, without financial data. User access tokens stay in memory; only the existing serverRequest wrapper attaches Authorization and X-Tenant-Id.

## Experience

1. From Secure Economics sidebar navigation, select an asset from the server-backed paginated registry.
2. Read server-calculated value, accepted valuation source, original cost basis, outstanding debt, indicative equity, indicative value change and observed operating net.
3. Review paginated valuation and cash-flow evidence; inspect financing facilities, dated balances and unverified reference labels.
4. WORKSPACE_OWNER and OPERATIONS may record financial evidence for assets in ACQUIRED, ACTIVE or SUSPENDED lifecycle. They may draft and internally accept valuations, record facilities and balances, manual cash flows and unverified reference labels.
5. Read-only roles and disposed, archived or pre-acquisition assets have no mutation forms. Backend independently enforces authorization.

Each mutation supplies current asset recordVersion as strong If-Match, a random Idempotency-Key retained for retry of identical payload/version, and a fresh API read afterward. HTTP 409, 412, 428, 401 and 403 errors are displayed without browser-preview fallback. A mismatched asset identity, tenant, currency or version fails closed.

## API routes

| Feature | Authenticated API |
| --- | --- |
| Asset index | GET /v1/assets?limit=20 |
| Version / currency | GET /v1/assets/:id |
| Economics | GET /v1/assets/:id/economics |
| Valuation history, drafts and acceptance | GET/POST /v1/assets/:id/valuations; POST /v1/assets/:id/valuations/:valuationId/accept |
| Facility and balance histories | GET/POST /v1/assets/:id/financing; GET/POST /v1/assets/:id/financing/:facilityId/balances |
| Cash-flow history and observations | GET/POST /v1/assets/:id/cash-flows |
| Unverified reference labels | GET/POST /v1/assets/:id/reconciliation-references |

All amounts remain decimal strings in the asset currency. The frontend only formats backend values; it never adds loans, posts accounting entries or annualizes ROI. Missing financing balance snapshots leave debt and equity Unknown. Interest rates are contractual labels only; no amortization schedule is computed.

## Local verification

    npm ci
    npm run typecheck
    npm test
    npm run build
    npx playwright install --with-deps chromium
    npm run test:e2e

B3.1 tests in e2e/secure-registry.spec.mjs mock the authenticated API contract to verify disabled deployment, OIDC-gated tenant reads, exact version and idempotency headers, preview isolation, unknown debt and read-only roles. Mocked tests **do not constitute actual issuer / PostgreSQL staging certification**.

## Real staging activation (separate outstanding gate)

Provision PostgreSQL 16 and all six migrations including 0006_b3_economics_integrity.sql. Configure an actual issuer and audience, public PKCE client and redirects, HTTPS API deployment, CORS exact-origin allowlist, and verified tenant owner enrolment. Publish only the six public identity/API settings to asset-runtime.json via the existing GitHub Pages workflow. Do NOT publish access tokens, private client secrets or database credentials.

Run 2-tenant live tests of read and write isolation, viewer and analyst restrictions, unknown financing balances, accept/supersede valuation, idempotent replay and strong ETag concurrency; verify no ledger posting, payment, independent appraisal or Wealth OS consolidation. Record staging URLs, issuer JWKS fingerprint, migration logs, tests and CI artifacts before marking live certification complete.

See BACKEND_B1_1.md, BACKEND_B2_1.md, BACKEND_B3.md, apps/api/openapi/openapi.json and .github/workflows/browser-certification.yml.

## Delivery truth

Implemented: Secure Economics UI routes, API commands, pagination, evidence, guarded forms, error states and automated browser-contract coverage.

Not activated: real Personal Kernel/OIDC issuer, HTTPS staging API, PostgreSQL staging infrastructure or financial providers. Finance OS reconciliation, real lender balances and independent appraisals are not implemented.

Next: close B3.1 staging activation gate, then B4 operations/maintenance/insurance backend authority.
