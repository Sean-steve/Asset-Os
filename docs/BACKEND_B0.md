# Asset OS — Phase B0 Backend Architecture, PostgreSQL & API Contracts

## Decision: keep the certified frontend separate

- **Frontend**: the 60-screen React/Vite application remains a standalone GitHub Pages preview. Its v6 browser-local snapshot is still **untrusted, synthetic-asset-capable data**. B0 does **not** automatically import it, grant identity or silently switch to a backend.
- **Backend**: isolated \`apps/api\` Fastify/TypeScript service; JSON OpenAPI 3.1 contract, PostgreSQL 16, atomic checksummed SQL migrations, forced tenant RLS, fail-closed identity boundary.
- **Infrastructure**: \`infra/docker-compose.yml\` runs PostgreSQL, a one-shot migrator and a private development API bound on localhost. PostgreSQL exposed only on 127.0.0.1 by default.
- **Deployment**: public GitHub Pages deploys **only static frontend**. It cannot run Fastify or PostgreSQL. A separately protected server deployment is required when B1+ makes domain endpoints operational.

## Domain authority boundaries

| Domain | Authority / phase |
| --- | --- |
| Asset identity, registry, lifecycle, valuation facts, maintenance, asset risk | Asset OS server will own authoritative records in B1+ |
| Actor identity, tenant binding, policy, final schedule | Personal Kernel / approved OIDC identity provider; **not activated in B0** |
| Posted financial transactions, payments, reconciled ledger | Finance OS; Asset OS stores only declared or governed, source-attributed observations |
| Consolidated net worth, wealth decisions | Wealth OS; Asset OS publishes minimum-necessary read projection later |
| Missions, contractor tasks | Mission OS; Asset OS creates **proposals**, never direct schedule authority |
| Document binary and sensitive evidence | Knowledge OS secure vault; Asset OS stores **opaque metadata references only** |
| Outbound notifications | Future consent-controlled provider; B0 has **no queue worker or delivery** |

## Persistence model

Migrations are under \`apps/api/migrations/\`. The B0 schema covers:

- Tenants, external identity binding *slots*, tenant memberships and registry.
- Lifecycle/acquisitions and itemized cost basis, ownership events/interests, legal disposition history.
- Valuation drafts/accepted history, financing facilities and dated outstanding balances (no inferred debt), income/expense observations (NOT Finance OS ledger).
- Maintenance plans/jobs, insurance metadata, utilization evidence, location history, asset relations and document *references*.
- Portfolios and membership history, self-assessed risk dimensions, one-period scenario inputs, decision notes.
- Kernel action *proposals*, local alert dispositions, disconnected integration plans.
- Audit event base (append-only to runtime role, **not cryptographically immutable**), outbox, inbox dedup and idempotency keys.

Amounts use \`NUMERIC(20,2)\` in PostgreSQL, represented by **decimal strings** over HTTP. **Never** implicitly convert currencies. Cross-tenant child references have composite foreign keys \`(tenant_id, id)\`. Current portfolio membership has a partial unique index. State-specific business guards/transactions become server domain service work in B1–B5; a schema alone does not prove workflow correctness.

All tenant tables use PostgreSQL **ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY**. Runtime access uses a separate non-superuser \`asset_os_app\` role without BYPASSRLS; missing \`app.tenant_id\` denies rows. \`withTenantTransaction\` sets tenant context using a transaction-local DB setting and resets it on commit/rollback. **Do not call it with an unverified header, client-supplied tenant ID or a decoded-but-unverified JWT.** B1 must bind an authenticated Personal Kernel/OIDC subject to the DB tenant and authorize every query and command.

## Implemented HTTP endpoints in B0

| Method / path | Behavior |
| --- | --- |
| \`GET /health/live\` | Process liveness only; no database assumption |
| \`GET /health/ready\` | PostgreSQL reachable under \`asset_os_app\` with migrations 0001–0003 applied, otherwise HTTP 503 |
| \`GET /v1/meta\` | API/contract versions, exact B0 capability list and **IDENTITY_NOT_CONFIGURED** |
| \`GET /v1/openapi.json\` | Exact OpenAPI 3.1 future API contract and availability labels |
| \`/v1/*\` remaining domain routes | HTTP **503 IDENTITY_NOT_CONFIGURED** regardless of supplied Bearer, X-Tenant-Id or cookies |

The OpenAPI includes explicit **planned, NOT IMPLEMENTED** contracts for registry, lifecycle, ownership, valuations, financing, operations, portfolios, Kernel action proposals and reports. It defines a future bearer token requirement, cursor pagination, tenant boundaries, idempotency request keys, optimistic asset versioning and error envelopes. B0 does **not** issue or validate real JWTs. Event contract definitions are in \`apps/api/openapi/events.json\`; no broker, worker or cross-OS messages operate yet.

## Run locally

Requires Node.js 22+ and Docker with Compose. From repository root:

\`\`\`bash
cp infra/.env.example infra/.env
# Change both placeholder passwords in infra/.env.
docker compose --env-file infra/.env -f infra/docker-compose.yml up --build -d
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
curl -i http://127.0.0.1:3001/health/live
curl -i http://127.0.0.1:3001/health/ready
curl -i http://127.0.0.1:3001/v1/meta
curl -i http://127.0.0.1:3001/v1/assets  # Expected 503 until B1 verified identity
\`\`\`

Use only URL-safe characters for Compose sample passwords or URL-encode reserved characters in connection strings. Database role provisioning in \`infra/scripts/init-db.sh\` occurs only on **initial PostgreSQL volume creation**; resetting an existing dev volume requires explicit safeguards because it destroys data. **Never run \`docker compose down -v\` on data you need.** In production, provision runtime credentials through a secrets manager and separate migration/server roles; production URLs require TLS. Never expose port 5432/5435 or unauthenticated API publicly.

For CI/local backend tests without Docker, use a PostgreSQL 16 instance and supply two explicitly different credentials:

\`\`\`bash
npm --prefix apps/api install
npm --prefix apps/api run typecheck
npm --prefix apps/api run test
npm --prefix apps/api run migrate
npm --prefix apps/api run migrate:check
npm --prefix apps/api run test:db
\`\`\`

\`MIGRATION_DATABASE_URL\` must be an owner/migrator URL and \`DATABASE_URL\` must use the \`asset_os_app\` role. Neither is checked into Git. Migrations must be reviewed before deployment, are applied atomically under an advisory lock, and reject altered checksums.

## Certification gates

\`backend-b0.yml\` provisions real PostgreSQL 16 in GitHub Actions, compiles backend TypeScript, runs DTO/contract unit tests, migrates under a separate owner role and certifies runtime RLS, cross-tenant references, role separation, null-tenant reads, audit write restrictions, migration checksum/idempotence, rollback isolation, fail-closed HTTP and readiness.

Frontend CI and Playwright browser certification remain unchanged, and the Pages pipeline continues to publish the existing dashboard.

## Next implementation direction

**B1 — Trusted Identity, Tenant Bootstrap and Registry Domain Services:** real OIDC/Personal Kernel authority binding with JWKS, issuer/audience validation and server-enforced membership/permissions; secure tenant onboarding; POST/GET/PATCH assets using transaction-scoped tenant RLS, optimistic concurrency, request idempotency, outbox emission and comprehensive real-PostgreSQL integration tests. B1 must not reuse localStorage fixtures as authenticated production records. Then B2 lifecycle/ownership, B3 valuations/finance observations, B4 operations, B5 portfolios/risk, B6 governed OS integrations/administration and production deployment certification.
