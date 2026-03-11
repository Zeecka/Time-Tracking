# Copilot instructions for `pointage`

## Big picture architecture
- Monorepo with two apps: Flask API in `backend/` and React UI in `frontend/`, orchestrated via Docker Compose (`compose.dev.yml`, `compose.yml`).
- Backend uses Flask application factory (`backend/app/__init__.py`) and registers blueprints under `/api/v1/*` (`code-pointage`, `projets`, `utilisateurs`, `pointages`, `stats`, `analyzer`).
- Data model is relational (`backend/app/models.py`): `CodePointage -> Projet -> Pointage`, with `Utilisateur` linked to `Pointage`.
- Serialization is via Marshmallow auto-schemas (`backend/app/schemas.py`) with nested objects returned in API responses.

## Domain rules you must preserve
- Domain language is French and API fields are French (`numero_semaine`, `annee`, `date_debut`, `periode_fin`, etc.); keep naming consistent.
- `Pointage` periods are half-day based and normalized to `matin|midi|soir`; legacy inputs (`journee`, `apres_midi`) are still accepted in backend normalization (`backend/app/routes/pointage.py`).
- Week/year logic is ISO-based: `date_debut` and `date_fin` must belong to the provided ISO week/year.
- Overlap detection is strict per user and returns `409` on conflicts.
- Adjacent pointages for same user+project are auto-merged (including note concatenation), so avoid changes that break merge semantics.
- Protected deletes are expected: delete code/projet/utilisateur with linked children returns `409`.

## Developer workflows
- Preferred dev run: `docker compose -f compose.dev.yml up --build --watch`.
- Backend dev container command auto-resets and seeds DB on startup (`flask init-db --reset && flask seed-dev && flask run ...`).
- Backend prod container starts with `entrypoint.sh` (`flask init-db`, then gunicorn).
- No migration tool is used; schema is created with `db.create_all()` and managed by `flask init-db [--reset]`.

## Testing and validation
- Backend tests are in `backend/tests/` and use in-memory SQLite testing config (`create_app("testing")` in `backend/tests/conftest.py`).
- Run backend tests with test deps installed: `cd backend && pip install -r requirements-test.txt && pytest`.
- Tests encode behavioral contracts (especially `409` conflict cases and merge/overlap behavior); update tests when intentionally changing those rules.

## Frontend integration patterns
- API client is centralized in `frontend/src/services/api.js` using `REACT_APP_API_URL` (default `http://localhost:5000/api/v1`).
- Keep endpoint paths aligned with backend blueprints (`/pointages/bulk`, `/stats`, etc.).
- `PointageGrid` (`frontend/src/components/PointageGrid.js`) duplicates critical ISO-week and period normalization logic for UX; keep frontend/back validation semantics aligned.
- Project visual motifs (`uni`, `raye`, `pointille`) are used in multiple components (e.g., `ProjetList`, `PointageGrid`), so preserve motif values and meaning.

## When adding/changing backend features
- Add or update route modules in `backend/app/routes/` and export blueprints in `backend/app/routes/__init__.py`.
- Keep response style consistent: JSON `{ "error": "..." }` for failures, `201` for create, `204` for successful delete.
- Prefer preserving existing API contracts over refactors, because frontend components call these endpoints directly with current field names.
