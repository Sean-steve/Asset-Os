# Asset OS — Phase B4: Maintenance, Insurance & Operations Backend

## Authority and activation

B4 implements tenant-verified PostgreSQL maintenance, insurance and operational evidence on top of B1–B3. It uses cryptographically verified RS256 OIDC tokens, membership-scoped transactions, FORCE RLS, WORKSPACE_OWNER/OPERATIONS writes, strong asset ETags, idempotency and atomic audit/PENDING outbox.

The backend is **not publicly deployed**. No real OIDC provider, HTTPS API staging, insurer, financial ledger, service dispatch or GPS/tracking provider is connected. Existing Phase 4 frontend screens stay browser-local until B4.1.

## Seven domain areas

| PostgreSQL table | Meaning | Runtime updates |
| --- | --- | --- |
| maintenance_plans | Recurring user-entered schedules | status, next_due, last_completed_on |
| service_jobs | Scheduled and completed internal jobs | status, completed_on, recorded_cost, completion_notes |
| insurance_policies | User-recorded policy references | status only |
| utilization_readings | Cumulative dated metric readings | None (append-only) |
| document_references | Opaque evidence identifiers | None (append-only) |
| location_events | Coarse location labels | None (append-only) |
| asset_relationships | Tenant-owned directed links | None (append-only) |

Migration 0007 adds strict relational constraints and indexes. Service jobs reference plans on the same tenant **and asset**; replacement policies reference prior policies on the same tenant and asset; relationships prevent duplicate/self links and COMPONENT_OF/DEPENDS_ON cycles with a tenant-level graph lock. All new operations are restricted to ACQUIRED, ACTIVE or SUSPENDED assets; disposed/archived records remain readable.

## Server endpoints

All paths below begin with /v1/assets/:assetId.

| Method | Suffix | Purpose |
| --- | --- | --- |
| GET | /operations | Tenant-scoped counts and latest recorded observations |
| GET | /operations-calendar | Up to 100 recorded deadlines; no external scheduling |
| GET/POST | /maintenance-plans | Cursor list and plan recording |
| POST | /maintenance-plans/:planId/actions | PAUSE or RESUME |
| GET/POST | /service-jobs | Cursor list and scheduling |
| POST | /service-jobs/:jobId/actions | START, CANCEL, COMPLETE |
| GET/POST | /insurance-policies | Cursor list, new or replacement policy |
| POST | /insurance-policies/:policyId/actions | CANCEL internal policy record |
| GET/POST | /utilization-readings | Cursor list and dated cumulative readings |
| GET/POST | /evidence-references | Cursor list and opaque evidence metadata |
| GET/POST | /location-events | Cursor list and label history |
| GET/POST | /asset-relationships | Cursor list and directed tenant links |

GETs require issuer-signed Authorization Bearer and verified X-Tenant-Id. Every POST additionally requires If-Match with current strong asset record version and an Idempotency-Key. Identical replay returns the same response. Changed replay payload = 409; stale ETag = 412; missing preconditions = 428. All successful writes increment asset version and atomically record trusted actor audit and minimum-necessary PENDING outbox entries (assetId, recordId, recordVersion). Outbox delivery is NOT activated.

## Operational rules

* Recurrence supports 1–365 days/weeks/months. Month-end dates clamp to last day of target month. Linked completed service jobs advance an ACTIVE plan from the completion date; PAUSED plans do not advance.
* Job status: SCHEDULED → IN_PROGRESS; SCHEDULED/IN_PROGRESS → COMPLETED or CANCELLED; terminal statuses are immutable. Completion cannot predate scheduled date or occur in the future. Recorded job cost is not a payment or Finance OS posting.
* Insurance policy status RECORD may become SUPERSEDED on replacement or CANCELLED internally. Policy reference, premium and coverage are user-entered metadata only; no insurer verification, payment, underwriting or guarantee of cover.
* Odometer/hours/count utilization readings must increase in date and not decrease in cumulative value. Counts must be integers. No telematics integration.
* Evidence labels do not upload or validate documents. Location labels do not represent live GPS. Asset links are user-entered contextual relationships, not legally verified.
* Operations calendar is an informational read projection only; no Personal Kernel schedule, notifications or provider delivery.
* Decimal money is represented as strings; client cannot forge verification, finance authority, provider dispatch or source event identifiers.

## Certification

Run seven checksummed PostgreSQL migrations with restricted non-BYPASSRLS runtime credentials, strict TypeScript, backend unit tests, real PostgreSQL signed issuer tests, frontend tests and Chromium certification. B4 tests cover multi-tenant/role denial, idempotency and ETag conflicts, state transitions, recurrence, insurance replacement, chronological readings, references, cycle prevention, RLS immutable privileges, audit/outbox and historical read-only behavior.

Live staging activation remains separate: real issuer/JWKS, trusted tenant enrolment, HTTPS API and database deployment, CORS, two-tenant signed-user evidence, monitoring, failure recovery and operator acceptance are required. Browser mock tests and CI PostgreSQL tests do NOT prove live production provisioning.

**Next:** Phase B4.1 — Secure Operations Frontend–Backend Integration and Staging Certification, followed by production infrastructure activation.
