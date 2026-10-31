# Asset OS — Phase B3: Valuation, Financing & Economics Backend

## Authority and environment truth

B3 is a versioned PostgreSQL backend implementation. It uses cryptographically verified OIDC access tokens, an active tenant membership, restricted PostgreSQL runtime role, FORCE RLS, strong asset ETags, operation idempotency and atomic actor audit / pending outbox records.

The backend is NOT hosted in production. There is no real Personal Kernel/OIDC issuer configured here, no external bank feed, no Finance OS ledger connection and no B3 server-verified financial frontend. Existing GitHub Pages remains a frontend preview with separate Secure Registry / Secure Lifecycle features; B3 financial screens remain browser-local until explicitly migrated.

## PostgreSQL domain model (migration 0006)

Valuations are immutable user-entered drafts, then internally ACCEPTED. A partial unique index permits one current ACCEPTED valuation per tenant asset. Later or equal-effective-date acceptance SUPERSEDES the existing acceptance; original evidence remains. This internal status is not an independent appraisal.

Financing facilities are user-entered loan metadata: lender display name, original principal, decimal interest rate, dates/frequency, and reference. Interest is never compounded or serviced. Outstanding balance snapshots are user-entered dated observations; dates must strictly advance and cannot predate facility start. Missing snapshots mean UNKNOWN debt, never zero.

Cash flows are user-entered INCOME, EXPENSE, CAPEX, FINANCING_INFLOW, or FINANCING_OUTFLOW observations. Client-supplied Finance OS event IDs or FINANCE_OS_PROJECTION authority are rejected. Reconciliation references are unverified labels for existing tenant cash-flow observations; they never reconcile or post actual transactions.

Runtime UPDATE/DELETE is removed for immutable facility, balance, cash-flow and reconciliation histories. Only valuation status/accepted_at may be updated. Audit and pending outbox records remain append-only for the runtime role.

## Server routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | /v1/assets/:assetId/valuations | Create draft valuation |
| POST | /v1/assets/:assetId/valuations/:valuationId/accept | Accept internal valuation, supersede previous |
| GET | /v1/assets/:assetId/valuations | Paginated valuation history |
| POST | /v1/assets/:assetId/financing | Record user-entered facility |
| GET | /v1/assets/:assetId/financing | Facility directory + latest balance |
| POST | /v1/assets/:assetId/financing/:facilityId/balances | Record dated outstanding balance |
| GET | /v1/assets/:assetId/financing/:facilityId/balances | Paginated balance history |
| POST | /v1/assets/:assetId/cash-flows | Record manual economic observation |
| GET | /v1/assets/:assetId/cash-flows | Paginated observations |
| POST | /v1/assets/:assetId/reconciliation-references | Record unverified reference |
| GET | /v1/assets/:assetId/reconciliation-references | Read manual references |
| GET | /v1/assets/:assetId/economics | Derived economics and missing-data status |

B3 POST endpoints require Authorization: Bearer ISSUER_SIGNED_ACCESS_TOKEN, X-Tenant-Id verified via active membership, Idempotency-Key and If-Match: "CURRENT_ASSET_VERSION". Only WORKSPACE_OWNER and OPERATIONS may write; Portfolio Analyst and Viewer read only. A replay with identical request and original ETag returns the saved response. Different payload on reused key = 409; stale ETag = 412; missing preconditions = 428. Records may be added only to acquired/active/suspended assets, with effective dates between acquisition and today. Disposed/archived assets remain readable, not writable.

## Derived economic snapshots

The asset-specific GET /economics response chooses the internally accepted valuation if present; otherwise the unverified registry entry, otherwise null. Source is explicitly labeled. Original cost basis is the sum of user-entered acquisition components, not a paid transaction.

Debt is the sum of each financing facility's most recent recorded outstanding amount. If ANY facility has no balance snapshot, debt and equity are null/unknown (never guessed). Indicative equity = selected valuation less all known debts, with negative values allowed. Indicative asset value change = selected value minus original cost basis, and percentage when positive basis exists. It is NOT annualized ROI or a realized taxable gain.

Observed operating net = user-entered INCOME minus EXPENSE minus CAPEX. FINANCING_INFLOW and FINANCING_OUTFLOW appear separately and do not contaminate operating net. All calculations use integer BigInt cents and PostgreSQL NUMERIC(20,2) within a single asset currency; no exchange-rate assumptions or Finance OS ledger postings.

## Events and certification

Each successful write atomically records the domain row, asset record-version, trusted actor audit, PENDING outbox event (assetId, recordId, recordVersion only), and idempotency response. No external delivery, Wealth OS merge, notification or Finance OS transfer is active.

CI runs six checksummed PostgreSQL migrations, strict backend TypeScript and unit tests, real PostgreSQL signed RS256 test-issuer workflows, tenant/RLS role isolation, valuation acceptance/supersession, exact-cent derived economics, dated balances, missing-data guards, idempotency/concurrent replay, immutable histories and post-disposal read-only. Existing frontend CI and Chromium suite guard regressions only; they are NOT B3 frontend-to-API staging certification.

## Next delivery

B3.1 should connect separate Secure Economics screens to the B3 API, without importing browser-local sample financial entries. A protected HTTPS backend and vetted real Personal Kernel/OIDC issuer must be provisioned before claiming real staging/production activation. B4 will implement server-authoritative operations/maintenance/insurance.

No claims of actual wealth, loan repayment, financial ledger, bank reconciliation, payment, legal-title verification or certified asset appraisal are made in B3.
