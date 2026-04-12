# Contract Index

Outstanding and historical development contracts.

Contracts are stored under `.harness/contracts/YYYY-MM-DD/` directories, one per production date.

## Status Legend

| Status | Meaning |
|--------|---------|
| `outstanding` | Not yet picked up for implementation |
| `in_progress` | Currently being implemented in an active delivery run |
| `implemented` | Completed and verified |
| `superseded` | Replaced by a newer contract |
| `cancelled` | No longer needed |

## Outstanding Contracts

- `2026-04-12/DEVELOPMENT_CONTRACT_1.md` — `outstanding` — Top workspace layout, table controls, and Explorer spacing polish for the virtualized browse workspace.
- `2026-04-12/DEVELOPMENT_CONTRACT_2.md` — `outstanding` — Fix virtualized track-row drag preview pointer alignment without regressing drag performance.
- `2026-04-09/set-workspace-security-hardening.md` — `outstanding` — Backend-only hardening for set-workspace CORS exposure and explorer edge-score request-size validation.

## Recently Completed

- `2026-04-09/set-building-expansion.md` — `implemented` — Full-stack replacement of the client-local set builder with server-persisted sets, pool, tracklist, and explorer graph, including new schema, API endpoints, and Set-tab sub-tabs.
