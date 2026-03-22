# Project Guidelines

## Build And Test
- Prefer Docker-first development.
- Start dev stack with live reload: `docker compose -f compose.dev.yml up --build --watch`.
- Services in dev: frontend `http://localhost:3000`, backend `http://localhost:5000`, MariaDB `localhost:3306`.
- Production-like stack: `docker compose -f compose.yml up -d --build`.
- Backend tests run without external DB: `cd backend && pip install -r requirements-test.txt && pytest --tb=short -q`.
- Frontend local workflow: `cd frontend && npm ci && npm start`.
- Frontend production build: `cd frontend && npm ci && npm run build`.

## Architecture
- Backend is a Flask app-factory (`backend/app/__init__.py`) with blueprints under `backend/app/routes/`.
- API prefix is `/api/v1` and resource paths are singular: `/tracking-code`, `/project`, `/user`, `/time-entry`, `/stats`.
- Core backend layers:
  - Models: `backend/app/models.py`
  - Schemas: `backend/app/schemas.py`
  - Route handlers: `backend/app/routes/*.py`
- Frontend is React with route-centric pages in `frontend/src/components/` and Axios API wrappers in `frontend/src/services/api.js`.
- i18n resources are in `frontend/src/i18n/en.json` and `frontend/src/i18n/fr.json`.

## Conventions
- Keep endpoint names and payload identifiers in English.
- For backend route changes, preserve existing response behavior where practical:
  - `201` on create success
  - `404` when resource not found
  - `409` for uniqueness/conflict cases
- Keep validation close to route logic and return explicit JSON error messages.
- Preserve time-entry domain behavior: overlap detection and merge semantics are business-critical.
- Prefer adding or updating tests in `backend/tests/` for backend behavior changes.

## Pitfalls
- No migration framework is configured. Schema updates typically require DB reset (`flask init-db --reset`) and reseed (`flask seed-dev`) in dev.
- Frontend uses `react-scripts@5`; keep `typescript` pinned to `4.9.5` unless the toolchain is upgraded.
- Docker builds rely on lockfiles and deterministic installs (`npm ci`).

## Useful References
- High-level overview: `README.md`
- Developer workflow and API details: `docs/README_DEV.md`
- CI pipeline: `.github/workflows/ci.yml`
- Backend test fixtures and isolation strategy: `backend/tests/conftest.py`
