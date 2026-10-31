# Phase B2.1 — Authenticated Lifecycle Frontend and Staging Certification

The Secure Registry contains a separate Secure Lifecycle experience:
- Route #/server-registry/lifecycle: tenant acquisition/disposition history with server cursor pagination.
- Route #/server-registry/asset/:id/lifecycle: database-backed acquisition, exact cost basis, ownership claims and transfers, guarded lifecycle actions, disposition and archive.
- Read/write authorization uses the existing verified OIDC access token, selected tenant membership, PostgreSQL RLS and role checks. The frontend sends strong If-Match record versions and stable idempotency keys and reloads authoritative state after writes.
- Viewer and Portfolio Analyst roles can read but not mutate. Server errors are surfaced; no client-side preview fallback or automatic sample-data import.
- Finance OS posting, verified legal title and personal asset claims are not implied.

## Certification gates

Automated backend CI exercises real PostgreSQL 16 with signed ephemeral RS256/JWKS tokens, cross-tenant isolation, actor permissions, acquisition, share assignments/transfers, disposition and immutable history. Browser Playwright uses mock authenticated API endpoints to test navigation, forms, request headers and denied-error/read-only handling. These do not prove a live identity provider has been deployed.

**Live staging remains unverified without real infrastructure and approved identity.** To certify a real staging system, first activate a protected HTTPS API, PostgreSQL, vetted OIDC issuer, first-owner tenant and exact allowed CORS origin using docs/BACKEND_B1_1.md. Acquire an issuer-issued access token into an operator-only chmod 600 file and run the provided explicit staging-only script:

    export B21_STAGING_ENVIRONMENT=staging
    export B21_STAGING_APPROVED=yes-testing-only
    export B21_STAGING_API_URL=https://STAGING_API_HOST/
    export B21_STAGING_TENANT_ID=STAGING_TENANT_UUID
    export B21_STAGING_TOKEN_FILE=/secure/staging-operator.jwt
    node apps/api/scripts/certify-b2-1-staging.mjs

This script MUTATES the selected staging tenant: it creates a clearly labeled asset, records acquisition, assigns/transfers ownership, activates/suspends/reactivates, disposes and archives it. It must NEVER run against production or real customer data. It does not log the JWT. Archive retains the complete audit record. The script fails closed on non-HTTPS URLs, absent approval, wrong identity/role or unexpected API result.

Record the external issuer metadata, browser PKCE redirect/token exchange, real user/member revocation, TLS/CORS behavior, PostgreSQL audit/outbox and backup/recovery evidence separately before stating that a live staging environment has been certified.

## Remaining

The legacy Phase 2 screens and dashboard remain browser-local preview workspaces; the newly linked Secure Lifecycle is the only B2.1 server-authoritative frontend path. Provider activation and protected staging hosting are deployment tasks and not accomplished by merging this code. Next domain phase: B3 — Valuation, Financing and Economics backend.
