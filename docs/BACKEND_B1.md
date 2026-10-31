# Asset OS — Phase B1 Trusted Identity & Registry Backend

## Delivered scope

B1 implements a server-authoritative PostgreSQL Asset Registry with cryptographically verified OIDC identity. The public GitHub Pages UI is still browser-local: it is **not** connected to this API and its sample/localStorage records are **not** automatically imported.

**Identity remains unconfigured until an operator supplies a real trusted issuer.** Without issuer, API audience and JWKS, domain routes correctly return HTTP 503. This repository does not operate a Personal Kernel issuer, host a backend server or create production accounts.

### Components

- apps/api/src/identity.ts — pinned OIDC issuer/audience/JWKS, RS256-only JWT verification, iat/exp/sub requirements, token lifetime bound, HTTPS and issuer-origin JWKS requirement; no trusting bare JWT claims or tenant headers.
- apps/api/src/bootstrap.ts — privileged first-owner enrollment requiring a real issuer-verified access token in a chmod-600 file and migration-owner database credentials; creates VERIFIED identity binding and ACTIVE workspace-owner membership atomically.
- apps/api/src/app.ts — tenant membership and role authorization inside a database transaction, not through user-provided role claims.
- apps/api/src/registry.ts — strict registry Create/List/Read/Update, versioned ETags, 24-hour idempotency records, audited actor identity, atomic PENDING outbox events, normalized tags and decimal-string money.
- apps/api/migrations/0004_b1_registry_security.sql — indexed identity and cursor lookups, no runtime physical asset deletion or outbox delivery-state mutation.
- apps/api/openapi/openapi.json and apps/api/openapi/events.json — implemented versus planned contract flags, minimum-necessary event projection.

### Authority and role matrix

| Principal | Read registry | Create / patch assets |
| --- | --- | --- |
| Verified Workspace Owner | Yes | Yes |
| Verified Operations | Yes | Yes |
| Verified Portfolio Analyst | Yes | No |
| Verified Viewer | Yes | No |
| Valid JWT without active verified tenant membership | No | No |
| Unsigned, expired, mis-audienced, forged token | No | No |
| No configured issuer/JWKS | No | No |

The X-Tenant-Id request header only selects a proposed tenant. JWT signature/issuer/audience/expiry is verified first. Then within PostgreSQL FORCE RLS and a transaction-local tenant scope, the issuer+subject must match a VERIFIED identity binding and ACTIVE tenant membership. Revocation takes effect on the next request. No role, tenant or identity is accepted from a free-form browser field.

### HTTP operations

| Method and path | Status |
| --- | --- |
| GET /health/live, /health/ready, /v1/meta, /v1/openapi.json | Active public foundation |
| GET /v1/me | Active with verified identity and membership |
| GET /v1/assets | Active, tenant-scoped, cursor page up to 100 and optional filters |
| GET /v1/assets/:assetId | Active, tenant-scoped, strong ETag |
| POST /v1/assets | Active for Owner/Operations, requires Idempotency-Key |
| PATCH /v1/assets/:assetId | Active for Owner/Operations, requires Idempotency-Key AND If-Match |
| Lifecycle, acquisition, ownership, finance, operations, intelligence, Kernel commands | Still 503, to be implemented in later phases |

B1 creates PLANNED assets; a client cannot set ID, tenant, owner authority, lifecycle or operational state. Currency cannot be silently changed in PATCH. A registryValue must be an exact decimal string and include valueAsOf; recorded amounts are user estimates, not bank values.

#### Example request body for asset creation

    {
      "name": "Workshop fleet vehicle",
      "category": "Vehicles",
      "currency": "KES",
      "registryValue": "1250000.00",
      "valueAsOf": "2026-10-31",
      "tags": ["Fleet"]
    }

Send Authorization: Bearer ACCESS_TOKEN, X-Tenant-Id: VERIFIED_TENANT_UUID and Idempotency-Key: UNIQUE_CLIENT_OPERATION_KEY. Successful POST returns status 201 and a strong ETag such as "1". GET returns the current ETag. For PATCH send If-Match: "1" and a new idempotency key. A stale ETag returns 412; a different payload for a reused idempotency key returns 409. Idempotent replay returns the original body, version and status and adds Idempotent-Replayed: true.

The mutation, tag changes, trusted actor audit record, minimal outbox event and idempotency response are committed **in the same database transaction**. Outbox events stay PENDING; no external Wealth/Kernel dispatch is performed.

## Configure and run locally

Requires PostgreSQL 16, Node 22+, and Docker Compose. Copy infra/.env.example to infra/.env, set different local owner/runtime database passwords, and supply all three:
- OIDC_ISSUER — your vetted Personal Kernel or OIDC HTTPS issuer URL.
- OIDC_AUDIENCE — the Asset OS API audience in access tokens (not a frontend client ID).
- OIDC_JWKS_URL — HTTPS JWKS endpoint on the same origin as the issuer.

Then start in the repository root:

    docker compose --env-file infra/.env -f infra/docker-compose.yml up --build -d
    curl -i http://127.0.0.1:3001/health/ready
    curl -i http://127.0.0.1:3001/v1/meta

There are **four** migrations applied automatically by the restricted local infrastructure. If no OIDC configuration is set, the API still builds and serves health endpoints, but registry endpoints remain fail-closed. For real browser access, deploy behind TLS and implement the protected CORS/OIDC client workflow separately; GitHub Pages is not automatically reconnected.

### Privileged first-owner bootstrap

Use a short-lived **access token** (NOT an ID token) directly from the trusted issuer for the operator who will own the first tenant. Put the access token in a file accessible only to the owner (chmod 600). Do not paste it into chat, shell history, GitHub repositories or issue trackers. The command below uses symbolic placeholders:

    export MIGRATION_DATABASE_URL='postgresql://asset_os_owner:URL_ENCODED_PASSWORD@127.0.0.1:5435/asset_os'
    export OIDC_ISSUER='https://trusted-issuer.example/realm'
    export OIDC_AUDIENCE='asset-os-api'
    export OIDC_JWKS_URL='https://trusted-issuer.example/realm/keys'
    npm --prefix apps/api install
    npm --prefix apps/api run bootstrap -- --tenant-slug example-team --tenant-name 'Example Team' --token-file /secure/path/owner-access.jwt --confirm

Bootstrap verifies the token against JWKS then creates an ACTIVE tenant, VERIFIED identity binding and WORKSPACE_OWNER membership inside one database transaction. It returns the new tenant ID; it never prints the token or external subject. Protect the migration owner credential. Other users and tenant administration require a separately governed invitation/provisioning flow in a later phase.

### Security and validation evidence

The GitHub Actions backend CI validates TypeScript, Node contract tests, four PostgreSQL migrations, FORCE RLS and restrictive runtime role, and uses a **real ephemeral RS256 signer and HTTP JWKS endpoint** to test success and rejection of signed access tokens. It exercises active/revoked membership, role checks, tenant isolation, pagination, immutable patch fields, stale ETag rejection, transaction-safe outbox and audit, concurrent idempotency and request validation.

Test-only HTTP loopback issuer is enabled **only when NODE_ENV=test and OIDC_ALLOW_TEST_LOOPBACK=true**. Production requires HTTPS. No signed tokens or private keys are committed.

### Remaining limitations

This does not yet deliver: a deployed Personal Kernel/OIDC provider, production hosting for the API, a connected frontend login workflow, secure tenant invitations and per-asset ACL, storage encryption/retention governance, Finance OS ledger integration, lifecycle command handlers, operations, external event delivery, password management or production compliance certification. OIDC cryptography can be tested locally without claiming an identity provider was actually activated.

**Recommended next:** B1.1 — activate a trusted real OIDC identity provider and complete frontend-to-backend registry integration in protected staging. Then B2 — acquisition, ownership and asset lifecycle server authority.
