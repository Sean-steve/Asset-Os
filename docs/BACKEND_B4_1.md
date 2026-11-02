# Asset OS — B4.1 Secure Operations Frontend–Backend Integration

## Implementation
B4.1 adds Secure Operations at #/server-registry/operations and #/server-registry/asset/:assetId/operations. The existing signed OIDC PKCE session and verified PostgreSQL tenant are required.

All seven B4 APIs are integrated: maintenance plans and pause/resume, internal service scheduling/start/cancel/completion, insurance records/replacement/cancellation, utilization readings, opaque evidence references, location labels, and same-tenant asset relationships. Read-only B4 operations summary and calendar are displayed alongside paginated server histories.

Existing Phase 4 operations remain browser-local previews. No sample/localStorage values enter protected tenant screens. Only WORKSPACE_OWNER or OPERATIONS can write to ACQUIRED, ACTIVE or SUSPENDED assets; all other roles and terminal assets remain read-only. Server-side enforcement is independent.

All writes include a versioned If-Match strong ETag and stable-on-retry Idempotency-Key. After a successful write the UI re-fetches protected asset, summaries and histories. Cross-tenant, stale-version, and protected read errors fail closed. There is no financial payment, external service dispatch, insurer verification, GPS location proof, document upload or delivered reminder.

## Automated certification
Frontend TypeScript/build and desktop/mobile Chromium verify OIDC gating, all seven module interactions, authenticated metadata, read-only denials, tenant separation, preview isolation and 412 concurrency handling. Real PostgreSQL backend CI uses 7 checksummed migrations, FORCE RLS, test-issuer signed identities, audited status workflows and atomic pending outbox. This is code-level certification, not real deployed staging.

## Live staging activation gate — NOT CERTIFIED
The default public/asset-runtime.json contains six empty connection values. Real certification requires: (1) dedicated PostgreSQL 16 with migrations 0001–0007 and restricted runtime credentials; (2) actual HTTPS Fastify API, issuer/JWKS and OIDC public PKCE client, exact CORS and redirect URLs; (3) two real tenant identities plus read-only role enrollment; (4) Github Pages public variables ASSET_API_BASE_URL, ASSET_OIDC_ISSUER, ASSET_OIDC_AUTHORIZATION_ENDPOINT, ASSET_OIDC_TOKEN_ENDPOINT, ASSET_OIDC_CLIENT_ID and ASSET_OIDC_AUDIENCE; (5) live workflow tests for each B4 command, 401/403/404/409/412/428 guards, idempotency, RLS, status, chronology, cycle prevention and history; (6) environment security, backups, monitoring and documented evidence. No secrets or tokens may be committed or published in Pages variables.

Verdict until these operational checks pass: LIVE STAGING BLOCKED / NOT CERTIFIED.

Next: B4.2 Live Staging Activation and Evidence Closure, followed by B5 Portfolio, Performance & Intelligence Backend.