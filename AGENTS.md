# Xeremia Agent Guide

## Repository

Xeremia is a Python toolkit for DJ library management: ingestion, feature extraction, harmonic mixing analysis, metadata hydration, and an interactive assistant for finding compatible transition matches. It is backed by PostgreSQL via SQLAlchemy and includes a Vite/React client for live browsing, set building, matching, and administration.

## Getting Oriented

| What | Where |
|---|---|
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Workflows | [docs/WORKFLOWS.md](docs/WORKFLOWS.md) |
| Conventions | [docs/CONVENTIONS.md](docs/CONVENTIONS.md) |
| Golden principles | [docs/golden-principles.md](docs/golden-principles.md) |
| README | [README.md](README.md) |

## Development Guidance

- Keep changes narrow and aligned with the existing module boundaries.
- Prefer established helpers, data models, and API patterns before adding new abstractions.
- Preserve runtime behavior unless the task explicitly asks for a product change.
- Add focused tests for behavior changes, especially around ingestion, matching, API contracts, and UI persistence.
- Do not commit local data, logs, caches, build outputs, virtual environments, or editor state.

## Application Notes

- Backend entry point: `src/api/app.py`.
- Web startup helper: `src/scripts/start_web.sh`.
- React client: `client/`.
- Test configuration: `pytest.ini`, `conftest.py`, and client Vitest tests under `client/src/`.
