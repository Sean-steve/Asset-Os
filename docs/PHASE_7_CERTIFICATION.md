# Asset OS — Phase 7 Frontend Certification & Release

## Scope and product boundaries

This release certifies the **frontend prototype** across the canonical 60-screen inventory (including parameterized/detail destinations). It does not authorize a backend, Personal Kernel identity/tenants, external finance/wealth integrations, insurer verification, security audit, task delivery, secure storage, notifications or production AI.

All certification evidence must come from actual GitHub Actions CI and production-preview Chromium browser runs. Unit tests alone cannot be called a browser certification.

## Release gate

1. **Domain regression:** \`npm test\` across all phases, including v1–v5 browser snapshot migration into v6.
2. **Strict TypeScript / production bundle:** \`npm run build\` uses Vite's exact \`/Asset-Os/\` base.
3. **Chromium desktop and mobile:** \`npm run test:e2e\` against \`vite preview\` (not a mocked React render), traverses all 60 roadmap entries, direct-deep-link reloads, responsive width checks, keyboard skip and critical workflows.
4. **Workflow certification:** user-entry asset → acquisition → portfolio assignment → maintenance → reminders survives reload; settings remain browser-scoped; CSV triggers download; integration planning is disconnected.
5. **Visual/state integrity:** no invented dashboard trend, alerts, upcoming events or activity; net equity remains unknown if any facility has no observed balance.
6. **Release control:** merge only after *all* required checks are green; inspect GitHub Pages deploy completion and record final commit.

## Explicit non-goals

- This static GitHub Pages app is not a production multi-tenant service or secure source of truth.
- Browser \`localStorage\` can be edited or cleared; there is no durable multi-device sync, trust anchor or access control.
- Five starter assets are **illustrative**, never external holdings. Browser smoke tests use isolated contexts and throwaway records.
- Dates, valuations, costs, insurance and utilization remain user-entered. No authoritative data feed is connected.
- Source code specifies 60 *inventory experiences*, including parameterized detail screens and shared routes; this is not a promise of 60 different URL templates.
- Chromium automated checks do not prove exhaustive WCAG compliance or production mobile-device parity.
- User acceptance and true end-to-end integrations require subsequent secure backend and staging certification.

## Release evidence

Populate the certification record from the actual pull request, CI and Pages deployment after checks complete. Never pre-report tests as passed.
