# Asset OS — B4.2–B4.4 Local PostgreSQL, OIDC & Authenticated Frontend

## What is now implemented

- **B4.2:** Ubuntu PostgreSQL first-run script at scripts/local-postgres.sh; dedicated asset_os DB, owner/migration role, non-superuser non-BYPASSRLS asset_os_app role, seven checksum-verified migrations, and private .local/asset-os.env. No Docker or Supabase required. No DROP, reset or volume deletion.
- **B4.3:** Loopback-only RS256 OIDC development provider with Authorization Code + PKCE S256, short-lived JWT access tokens, single local developer login and separate CLI-only owner-bootstrap secret. No production identity bypass: API explicitly allows HTTP 127.0.0.1 only with NODE_ENV=development and ASSET_OS_ALLOW_LOCAL_OIDC=yes. Production retains HTTPS issuer/JWKS enforcement.
- **B4.4:** Connected Workspace at #/server-registry/workspace links authenticated PostgreSQL registry, acquisition/lifecycle/ownership, valuation/finance evidence and maintenance/insurance/operations. Existing secure modules preserve strong ETags, idempotency, tenant verification, role guards and API-only data. B5 portfolio and B6 Kernel/admin preview screens are NOT backend-enabled.

## Ubuntu local run (PostgreSQL already installed)

Requirements: Ubuntu PostgreSQL 16 running locally on port 5432; sudo access to postgres peer-auth account; Node.js 22+; npm. An existing PostgreSQL data directory is not reset. The script only creates or reuses the asset_os database and two dedicated roles. It refuses an existing asset_os database with the wrong owner.

From a fresh clone:

    git clone https://github.com/Sean-steve/Asset-Os.git
    cd Asset-Os
    npm run local:setup
    npm run local:dev

The first command creates private generated passwords in .local/asset-os.env, installs API dependencies and verifies all 7 migrations. If PostgreSQL is not running or port 5432 is not accessible, fix the local Ubuntu PostgreSQL service and rerun; the script does not delete data. The second command starts loopback issuer :3003, enrolls a verified owner into Postgres if the local tenant does not exist, starts API :3001 and Vite :5173.

Open http://127.0.0.1:5173/Asset-Os/#/server-registry and choose Sign in securely. Username: owner. Retrieve the locally generated password:

    grep '^LOCAL_IDP_PASSWORD=' .local/asset-os.env

After login, the local tenant UUID is prefilled; click Verify membership. Navigate to Connected Workspace, create a server asset in Secure Registry, then use Lifecycle to acquire it, Economics for recorded valuations and Secure Operations for maintenance/insurance. Preview-only modules remain browser-local and are not considered real.

Stop the three local services with Ctrl+C. PostgreSQL data remains persistent. Do NOT commit .local/asset-os.env, .local/tenant-id or access tokens. The local issuer rotates signing keys every start. Tokens intentionally expire, so a browser reload requires new login. Local test identity is deliberately limited to one account and is not a production or staging identity provider.

## Automated certification

Frontend CI typechecks Vite and React and builds the deployable preview. B4 backend CI validates PostgreSQL 16 schema, RLS, issuer verification, lifecycle, economics and operations. Dedicated apps/api/test/local-idp.unit.test.mjs certifies the local provider's PKCE, RS256, single-use codes and production deny rules.

An additional GitHub Actions workflow .github/workflows/local-full-stack.yml provisions PostgreSQL 16, creates a signed owner identity, starts an actual OIDC issuer + Fastify + Vite, and runs local-e2e/local-stack.spec.mjs through Chromium without mocking the API. This provides repeatable local-stack certification; it does NOT prove the user's Ubuntu machine has been provisioned until setup is run there.

## Limitations and production boundary

Production and public GitHub Pages keep an intentionally empty asset-runtime.json until a real HTTPS issuer, backend and database are configured. The Vite localhost runtime override is used only during the development server, not in Vite production builds; there are no passwords or access tokens in static frontend assets. A local self-issued token has NO validity as a production credential. For multiuser staging, real OIDC, invitations, TLS, backups, migrations and infrastructure validation are separate work.

Next after local confirmation: B5 portfolio and performance backend, B6 governance/integrations, full release certification.
