# Asset OS — Phase B1.1: Identity Activation & Frontend Integration

## Delivery status and environment truth

**Implemented and CI-testable:** public OIDC Authorization Code + PKCE SPA integration, in-memory access-token session, guarded tenant verification, a separate fully functional PostgreSQL-backed Registry frontend (list/filter/page/detail/create/edit), strict server-side origin allowlist, and mocked-browser flow tests. Existing 60 browser-local screens and demo work remain separately labeled and unchanged in authority.

**Not activated:** There is no live operator-supplied Personal Kernel/OIDC issuer, registered public SPA client, protected public API domain, deployed backend, or verified production tenant. The GitHub Pages deployment has deliberately empty public runtime settings until the operator configures them. This is not a live production identity activation.

## Server and browser architecture

The public configuration is fetched from `/Asset-Os/asset-runtime.json` without caching. It contains **public settings only**: API origin, issuer, authorization endpoint, token endpoint, public OIDC client ID, and API audience. **Never add a client secret or access token.** GitHub Pages reads values from repository/environment variables during the deploy workflow. With all variables blank the Secure Registry displays "Production identity is not activated", not a fake login.

The client uses Authorization Code with PKCE-S256, one-time CSRF `state`, short-lived verifier in sessionStorage and precise redirect URI `https://sean-steve.github.io/Asset-Os/`. OAuth code is removed from the browser URL before token exchange. JWT bearer **access tokens are held in React memory only**, never in localStorage, sessionStorage, cookies, GitHub, analytics or browser URLs; reload deliberately requires new sign-in. There is no client-secret flow and no browser-based token refresh or silent auto-login.

The UI calls `/v1/me` with its access token and a **user-selected tenant UUID**, which the server checks against the issuer-signed subject and a verified active PostgreSQL tenant membership. This call, not the tenant header, determines authority. Unauthorized tenants, revoked memberships or absent login cannot load server assets. Strong ETags, idempotency keys, PostgreSQL RLS and server-side role checks remain mandatory on every write. Every network error preserves a visible failed state; **no fallback to sample assets**.

The authenticated view lives at `#/server-registry` and its `/new` and `/asset/:id[/edit]` routes. Browser-local `#/assets`, dashboard, lifecycle, finances, portfolios and other modules remain explicitly flagged as preview data. Real server asset records are never inserted into localStorage. Backend B2–B6 must implement server services before those modules can move to authoritative mode.

## Production activation prerequisites

1. **Approved identity issuer:** Register a **public PKCE** OIDC/OAuth client with a trusted provider. Enable Authorization Code + PKCE (S256), no client secret, redirect URI exactly `https://sean-steve.github.io/Asset-Os/`, allowed origin `https://sean-steve.github.io`, and a short-lived RS256 access token with Asset OS API as audience. Ensure issuer/JWKS are HTTPS, same origin, and backend issuer/audience match.
2. **Backend hosting:** Deploy Fastify and PostgreSQL privately and expose only an HTTPS API behind a controlled reverse proxy. Provision *distinct* migration and restricted runtime roles and secrets via a secret manager. Configure `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` and `CORS_ALLOWED_ORIGINS=https://sean-steve.github.io`. CORS permits only exact configured origins and explicit GET/POST/PATCH headers; it is **not** authorization.
3. **Tenant enrollment:** Obtain a real externally issued **access token** for the initial owner. Provision via the privileged `npm --prefix apps/api run bootstrap -- --tenant-slug ... --tenant-name ... --token-file /private/path/jwt --confirm` flow documented in `docs/BACKEND_B1.md`, and protect/delete the temporary token file. Do not enter JWTs or DB credentials into GitHub Actions variables used for frontend builds.
4. **GitHub Pages public variables:** In the GitHub repository settings for Actions/Pages, set the **nonsecret** variables `ASSET_API_BASE_URL` (HTTPS API origin), `ASSET_OIDC_ISSUER`, `ASSET_OIDC_AUTHORIZATION_ENDPOINT`, `ASSET_OIDC_TOKEN_ENDPOINT`, `ASSET_OIDC_CLIENT_ID`, `ASSET_OIDC_AUDIENCE`. All six must be valid, on matching trusted issuer origins where appropriate, or the UI fails closed. Re-run Pages deployment. A Pages variable is not a confidential credential.
5. **Live staging certification:** Verify real provider discovery, redirect and token exchange, tenant membership denial/revocation, cross-origin browser preflight, end-to-end PostgreSQL persistence, concurrent idempotency/ETags, logout/expiry, secret handling, browser support and network isolation. Record provider metadata and environment evidence before calling production identity activated.

## Running local preview

`npm install && npm run dev` runs the frontend prototype. Public `public/asset-runtime.json` is empty intentionally. To test against a developer-controlled HTTPS identity/API staging service, edit the local **untracked** runtime JSON file with *public* URLs only (never commit site-specific credentials); set backend `CORS_ALLOWED_ORIGINS` for the browser origin. The backend Compose setup is in `docs/BACKEND_B1.md`.

### Certification

The `e2e/secure-registry.spec.mjs` suite uses Playwright to simulate the public OIDC authorization redirect and token endpoint, verify real PKCE parameters/state, require `/v1/me` membership before displaying server records, test server create/edit headers, ensure no access-token persistence, and check the disabled/no-provider state. Its mock endpoints **do not** prove a third-party production issuer is active. Existing backend CI uses ephemeral signed RS256 keys and PostgreSQL 16 for actual JWT/tenant/RLS/asset workflow validation. The dedicated `apps/api/test/cors.unit.test.mjs` covers allowed/denied preflights.

**Recommended next:** Activate a vetted issuer and protected API in staging as a separate environment operation, verify it end-to-end, then Phase B2 server-authoritative acquisition, ownership, lifecycle and disposition.
