# Development Contract

## Source Inputs
- `BREAKER_REPORT.md` from `/Users/alen/Dev/dj-tools/.harness/runs/20260409T091130Z-delivery-development-contract-source-inpu`
- Breaker security follow-on request covering only CORS over-exposure and unbounded edge-score pair input

## Selected Intent
- delivery

## Contract Driver
- breaker-driven

## Selected Recommendation IDs
- none

## Deferred Inputs / Non-goals
- All breaker test-coverage findings
- M3U8 export path exposure
- Pagination or unrelated API hardening
- Frontend/UI changes
- Authentication, authorization, or broader session/security model changes

## Contract
```md
DEVDSL-1
MODE: STRICT
FLAGS: NO_EARLY_STOP TEST_GATE(full) SCOPE_LOCK(explicit) OUTPUT_SCHEMA(default)
SCOPE: Backend-only hardening for the set workspace API in `src/api/app.py`, `src/api/routes.py`, and `src/api/schemas.py`, limited to (1) replacing wildcard CORS with the actual app origin or a configurable whitelist, and (2) bounding the explorer edge-score request size so oversized pair arrays are rejected before expensive processing.
DO: Restrict CORS so arbitrary origins can no longer issue mutating set-workspace requests. Add request validation for the edge-score `pairs` payload with a hard maximum size of 100 pairs, and ensure the route/service path respects that limit without adding unrelated behavior changes.
ACCEPTANCE: 1. `allow_origins=["*"]` is removed for the API and replaced by a narrow allowed-origin configuration appropriate for the app. 2. The explorer edge-score request schema enforces a maximum of 100 pairs and requests above that limit fail validation with a 4xx response. 3. Backend tests cover both the restricted CORS configuration and the oversized edge-score request rejection. 4. No scope is added beyond these two fixes.
OUTPUT: schema=default
```

## Ordering Constraints
- `independent`

## Notes to Orchestrator
- Keep this as a single follow-on contract because both findings are backend security hardening for the same set-workspace surface and can be delivered together without widening scope.
- Preserve traceability to the security lane in `BREAKER_REPORT.md`; do not fold in the separate test-coverage follow-on items from the same report.
