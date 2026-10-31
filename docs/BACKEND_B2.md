# Asset OS — Phase B2: Lifecycle, Acquisition & Ownership Backend

## Release boundary

Phase B2 extends the isolated apps/api PostgreSQL service and does not alter the browser-local Phase 2 prototype, nor deploy an authenticated backend. The live GitHub Pages site is still a frontend preview; its sample holdings are not authenticated database records. Actual production OIDC credentials, backend hosting, tenant onboarding and provider staging certification have NOT been activated.

## Domain implementation

Lifecycle is guarded: PLANNED → ACQUISITION_PENDING → ACQUIRED, then ACQUIRED → ACTIVE → SUSPENDED → ACTIVE as permitted. From ACQUIRED, ACTIVE or SUSPENDED, a typed disposition transitions to DISPOSED, followed by ARCHIVED (terminal). Invalid skips and reactivation after disposal are rejected. Transitions are recorded with immutable server-side audit history.

Acquisitions record one initial effective-dated source per asset, with method, counterparty label, optional evidence reference and purchase, taxes, fees, installation, improvements and other cost components. A purchase requires a positive purchase amount. All calculations use integer cents and PostgreSQL NUMERIC(20,2). Historical cost basis is not a verified payment or a Finance OS ledger entry.

Ownership has four dimensions: ECONOMIC and BENEFICIAL require positive exact shares 0.01–100.00% with active totals <=100%; LEGAL and CONTROL are non-percentage references. The server checks source ownership and effective dates, rejects duplicate active parties and unsafe backdating, and serializes mutations using asset-row locking. A partial transfer closes the source period, creates the recipient share and retains the remaining source share as a new effective-dated interest. Immutable assignment and transfer events preserve what was recorded. These are USER RECORDED CLAIMS, not verified deeds, shareholder-register or KYC facts.

Disposition is recorded with confirm DISPOSE, type, effective date, proceeds, costs, notes/counterparty and asset currency. It snapshots the original user-recorded cost basis. Net proceeds may be negative, and estimated gain is a purely indicative comparison (proceeds minus costs minus recorded cost basis). This never posts to Finance OS, initiates a payment, certifies tax treatment or triggers Wealth OS net-worth changes.

All write commands require a verified RS256 OIDC principal, ACTIVE tenant membership, WORKSPACE_OWNER or OPERATIONS role, Idempotency-Key, and a strong If-Match record-version ETag. Changes, actor audit and PENDING minimum-necessary outbox events commit in one PostgreSQL transaction. Replayed commands do not duplicate records. Stale ETags return 412; mismatched idempotency hashes return 409; missing preconditions return 428.

## Implemented server endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /v1/assets/:assetId/lifecycle-actions | START_ACQUISITION, ACTIVATE, SUSPEND, REACTIVATE, ARCHIVE |
| POST | /v1/assets/:assetId/acquisitions | Record one initial acquisition and itemized costs |
| POST | /v1/assets/:assetId/ownership-interests | Assign a dimension-specific interest |
| POST | /v1/assets/:assetId/ownership-transfers | Partial/full current economic or beneficial transfer |
| POST | /v1/assets/:assetId/disposition | Confirm user-entered disposal |
| GET | /v1/assets/:assetId/lifecycle | Combined lifecycle, acquisition, ownership, disposition history |
| GET | /v1/assets/:assetId/acquisitions | Initial acquisition |
| GET | /v1/assets/:assetId/cost-basis | Component costs and currency |
| GET | /v1/assets/:assetId/ownership-interests | Effective-dated interest history |
| GET | /v1/assets/:assetId/ownership-events | Ownership change event history |
| GET | /v1/assets/:assetId/disposition | Disposal and indicative gain |
| GET | /v1/acquisitions | Tenant acquisition center, limit/cursor pagination |
| GET | /v1/dispositions | Tenant disposition center, limit/cursor pagination |

Authenticated write example after GET asset returns an ETag:

    POST /v1/assets/<asset-uuid>/lifecycle-actions
    Authorization: Bearer <real signed access token>
    X-Tenant-Id: <verified tenant UUID>
    If-Match: "1"
    Idempotency-Key: begin-acquisition-123456
    Content-Type: application/json

    {"action":"START_ACQUISITION","reason":"Acquisition review initiated"}

With the updated ETag:

    POST /v1/assets/<asset-uuid>/acquisitions
    ...
    {"method":"PURCHASE","effectiveOn":"2026-10-30",
      "costs":{"purchase":"1200.25","taxes":"50.10","fees":"5.01",
               "installation":"0","improvements":"9.64","other":"0"}}

The resulting cost basis is "1265.00" in the asset currency. All content is user-entered pending evidence validation.

## Security and storage

Migration 0005 adds ownership dimension/percentage constraints, active-party uniqueness, domain history indexes, disposition cost/gain snapshots, and removes runtime UPDATE/DELETE privileges for immutable acquisition, cost, lifecycle event, ownership event and disposal records. Asset physical deletion and outbox delivery-state mutation remain prohibited to the API runtime. RLS and composite tenant foreign keys reject cross-tenant insertion and reads.

The server is not a legally certified ownership register; outbox records are not delivered, and DB administrators remain capable of privileged change (no cryptographically tamper-evident audit claim).

## Certification

GitHub Actions runs strict TypeScript and unit tests, migrations 0001–0005 with checksum check, real PostgreSQL and a temporary signed OIDC/JWKS fixture, B1 regression, and B2 workflow tests: acquisition guard and precision, 100% share caps, partial transfer conservation, immutable event evidence, negative gain, archival, role denial, tenant isolation, concurrency and repeat command idempotency. Existing desktop/mobile Chromium frontend checks continue to protect the 60-screen prototype and Secure Registry against regressions, but do not establish Phase 2 frontend-to-backend parity.

## Remaining

Live production activation depends on a trusted real OIDC issuer, protected HTTPS API environment, managed secrets, user/tenant enrollment and real staging workflow tests. Connecting Phase 2 acquisition/ownership/disposal UI to server endpoints is a separate frontend migration task. The next backend domain stage is B3 — Valuation, Financing & Economics; its money source remains Finance OS, with Asset OS storing governed observations only.
