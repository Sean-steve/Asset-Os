# Asset OS — B2.1 Authenticated Lifecycle Frontend & Controlled Staging Certification

## Delivered experience and truthful environment status

**Implementation:** Secure Registry now includes a connected lifecycle workspace at \`#/server-registry/asset/:id/lifecycle\`, reachable from each authenticated asset detail. It reads B2 PostgreSQL snapshots and can create lifecycle actions, initial acquisitions/cost-basis components, economic and beneficial ownership interests, non-percentage legal/control references, partial share transfers and disposition records. It displays effective-dated history and disposal calculations from the server.

**Separation:** The original Phase 2 Acquisition, Ownership, Disposal and Lifecycle prototype screens remain **browser-local preview workspaces**; they link to the Secure Registry but do not automatically migrate local sample assets. Only the new authenticated B2.1 workflow is server-authoritative. Non-registry modules remain previews pending their backend services.

**Staging certification levels:**
1. **CI controlled full-stack staging** (implemented): real PostgreSQL 16, real compiled Fastify API and existing B2 migrations, short-lived operator-bootstrapped tenant, self-signed ephemeral **test-only** RS256 issuer/JWKS and PKCE OAuth server, production-built Vite preview, Chromium browsers exercising HTTP from UI through database. This certifies the complete technical workflow against real database records *inside CI*, including authenticated tenant scoping and cross-tenant denial.
2. **Live provider staging** (**NOT completed**): no approved third-party/Personal Kernel OIDC provider or server HTTPS hostname has been supplied or configured; there is no deployed backend available to test externally.
3. **Production activation** (**NOT completed**): no real customer tenant or externally reviewed ownership authority is live. GitHub Pages continues to ship blank public identity config until a trusted provider is configured.

The GitHub Actions workflow is \`.github/workflows/b2-1-controlled-staging.yml\`, and evidence comes from its successful run and \`e2e/controlled-staging.spec.mjs\`. It must remain on ephemeral GitHub runners and must never be deployed to a public server: the test identity issuer is explicitly restricted to \`CI=true\`, \`NODE_ENV=test\`, and \`ASSET_OS_FULLSTACK_STAGE=1\`.

## End-user B2.1 flow

1. Visit **Secure Registry** and select **Sign in securely**. The SPA performs OIDC Authorization Code + PKCE, holds access token only in memory, and verifies a selected tenant UUID via \`GET /v1/me\`. No passwords or client secrets are collected.
2. Open **Server Asset Registry**, select an authenticated asset, then **Lifecycle, acquisition & ownership**. The page loads \`GET /v1/assets/:id/lifecycle\` and checks the tenant and ID against the verified session before displaying results. A missing/forbidden asset never falls back to sample records.
3. **Overview:** PLANNED → ACQUISITION_PENDING, ACQUIRED → ACTIVE, ACTIVE ↔ SUSPENDED, DISPOSED → ARCHIVED. Every action requires a reason and a fresh asset record version.
4. **Acquisition:** record method, effective date, counterparty/evidence metadata, and six exact decimal costs; submitted body goes to \`POST /v1/assets/:id/acquisitions\`. Cost basis comes from the server. Never assume a payment or third-party receipt exists.
5. **Ownership:** assign economic/beneficial shares (max 100% active per dimension), nonpercentage legal/control claims, and transfer a fraction of a current percentage interest to a new party. Current and closed historical interests remain visible. These are unverified user-entered claims, NOT legal title or stakeholder KYC.
6. **Disposition:** require explicit \`DISPOSE\` confirmation, date, amount, costs and reason; the server persists a disposition and transitions to DISPOSED. Estimated gains/losses are informational and **do not** create Finance OS ledger entries, payments or tax filings.
7. **History:** read the persisted lifecycle and ownership event timeline. Disposal and archived assets remain viewable; unauthorized writes are blocked server-side.

Server mutation requests send verified bearer + tenant selection, \`If-Match: "<asset.recordVersion>"\` and an operation-scoped \`Idempotency-Key\`. After every successful write, the UI **reloads** the authoritative snapshot. If the server returns 412 (someone else modified the asset), the UI refreshes the version, reports the conflict, and **does not resubmit automatically**. A repeated network request reuses its idempotency key for the same exact payload and version; changing inputs causes a new key.

Role restrictions: only WORKSPACE_OWNER and OPERATIONS have active mutation forms. VIEWER and PORTFOLIO_ANALYST can read. The PostgreSQL server independently checks membership/role on every request; disabling a button alone is never treated as security.

## Controlled CI staging topology

- PostgreSQL 16 service with separate \`asset_os_owner\` migration and restricted \`asset_os_app\` runtime roles, RLS/foreign keys, checksummed migrations 0001–0005.
- Local **test-only** OIDC JWKS and Authorization Code + PKCE server on loopback port 4300; RS256 private key is generated in memory at CI runtime, never committed. Authorizations are short-lived one-time codes and PKCE-S256 verifier is validated by the test issuer.
- Real Fastify REST API on loopback port 3001 with an exact \`http://127.0.0.1:4173\` CORS allowlist; test issuer exception is enabled only in explicit test mode.
- Vite production build served at \`http://127.0.0.1:4173/Asset-Os/\`. Its public runtime config points ONLY at ephemeral local test services for that job. This config is overwritten only on the CI runner and never deployed to Pages.
- Playwright desktop/mobile Chromium performs sign-in → server asset create → acquisition → share assignment → share transfer → activation → disposition → archival. It then reads the persisted lifecycle from the real API and asserts cost basis, transferred shares, computed gain and final archived state. A cross-tenant request with the same signed token is denied.
- A separate existing backend B2 test suite covers invalid JWTs, read-only roles, revoked members, concurrency, owner-share caps and database constraints.

**How to run locally:** a disposable PostgreSQL 16 with CI-like credentials and a restricted runtime role is needed. The controlled OAuth harness deliberately rejects execution unless CI=true, ASSET_OS_FULLSTACK_STAGE=1 and NODE_ENV=test. Do not run the test issuer against development/production data. Prefer GitHub Actions controlled certification for repeatability.

## External staging / production activation gate

To certify real staging, supply an approved Personal Kernel/OIDC provider with issuer + JWKS and a public PKCE client, an HTTPS API host with PostgreSQL and secrets management, CORS origin for GitHub Pages, tenant bootstrap credentials, and non-sensitive test assets. Configure the six **public-only** Pages runtime variables documented in \`docs/BACKEND_B1_1.md\` and redeploy Pages after testing. Validate the genuine provider login redirect, OIDC JWKS trust, active membership, revoke/relogin, asset state mutation against real DB, backup and audit, HTTPS/CORS and error handling. Do not supply tokens, passwords or client secrets in chat or the repository.

**Remaining work:** live identity/protected API staging activation, authoritative migration of the original Phase 2 preview pages if desired, document/attestation verification and Finance OS/Wealth OS integration. B3 backend valuations and financing can proceed separately without pretending these gates are closed.
