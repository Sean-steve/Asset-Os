# Asset OS — Screen Implementation Matrix

**Total:** 60 screens (60 principal product experiences). Phase 1 (Screens 01–10) is delivered as a frontend prototype; no backend, production data or Kernel integration is connected.

| Phase | Screen IDs | Feature area | Current status |
| --- | --- | --- | --- |
| 0 | Foundation | UI shell, design system, routing, CI and GitHub Pages | Implemented |
| 1 | 01–10 | Command Center, registry, asset details, add/edit, classification, tags, advanced search, activity, type-specific views | **Implemented (frontend-only)** |
| 2 | 11–20 | Acquisition, ownership and lifecycle | Planned |
| 3 | 21–30 | Valuation, financing and economics | Planned |
| 4 | 31–40 | Maintenance, insurance and utilization | Planned |
| 5 | 41–50 | Portfolio, intelligence and risk | Planned |
| 6 | 51–60 | Kernel integration and administration | Planned |
| 7 | All | Cross-role and responsive experience certification | Planned |

## Phase 1 route map

| ID | Screen | Route |
| --- | --- | --- |
| 01 | Asset Command Center | `#/dashboard` |
| 02 | My Assets — Registry | `#/assets` |
| 03 | Asset Details — Overview | `#/asset/:id` |
| 04 | Create Asset | `#/assets/new` |
| 05 | Edit Asset | `#/asset/:id/edit` |
| 06 | Classification Directory | `#/classifications` |
| 07 | Asset Tags and Collections | `#/tags` |
| 08 | Advanced Asset Search | `#/search` |
| 09 | Asset Activity Timeline | `#/activity` |
| 10 | Asset-Specific Detail Views | `#/type-views` and `#/asset/:id/type` |

## Functional acceptance

- Create and edit assets using validated forms; preserve immutable IDs and numbers.
- Store demo and locally created data in browser localStorage only; support explicit demo reset with confirmation.
- List, paginate, filter, sort and search assets; deep-link to asset detail.
- Categorize assets and create custom categories/subcategories (without changing system taxonomy).
- Create, rename, remove and assign tags with referential consistency across local assets.
- Display per-category specialized fields and a dedicated asset-type detail profile.
- Maintain a bounded local activity stream for edited/created assets; clearly disclose non-authoritative nature.
- Display dashboard KES value/equity derived from browser records without silently converting currencies.
- Keep synthetic trend, monthly revenue/expenses, alerts and activity examples identified as illustrative.
- Preserve visual reference, responsive sidebar, reusable components and GitHub Pages deployment.

## Explicit V1 boundaries

Browser localStorage is **not** secure storage, a server database, an immutable audit trail, authorization, legal ownership or a Finance OS ledger. Do not enter sensitive or confidential real-world data. Lifecycle transition, acquisition, ownership, acceptance of valuations, asset maintenance/insurance, risk and cross-engine integrations must be implemented in their dedicated phases rather than simulated as completed.
