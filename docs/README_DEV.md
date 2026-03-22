# Development Guide

This documentation covers all technical information useful for local development.

## Project Structure

```
pointage/
├── compose.dev.yml            # Dev orchestration (watch + reload)
├── compose.yml                # Standard orchestration
├── package.json               # Root utility scripts
├── README.md                  # Main documentation
├── backend/                   # Flask application
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py       # Flask factory
│       ├── config.py         # Configuration
│       ├── models.py         # SQLAlchemy models
│       ├── schemas.py        # Marshmallow schemas
│       ├── extensions.py     # Flask extensions
│       └── routes/           # REST API blueprints
│           ├── tracking_code.py
│           ├── project.py
│           ├── user.py
│           ├── time_entry.py
│           └── stats.py
├── frontend/                  # React application
│   ├── Dockerfile
│   ├── package.json
│   ├── public/
│   └── src/
│       ├── App.js            # Main application
│       ├── index.js          # Entry point
│       ├── services/
│       │   └── api.js        # Axios API client
│       └── components/       # React components
└── docs/
    └── assets/               # Screenshots and resources
```

## REST API

### Endpoints

All API routes are prefixed with `/api/v1`.

#### Tracking Codes
- `GET /api/v1/tracking-code` - List all codes
- `GET /api/v1/tracking-code/{id}` - Get code details
- `POST /api/v1/tracking-code` - Create a code
- `PUT /api/v1/tracking-code/{id}` - Update a code
- `DELETE /api/v1/tracking-code/{id}` - Delete a code
- `GET /api/v1/tracking-code/export-csv` - Export codes as CSV
- `POST /api/v1/tracking-code/import-csv` - Import codes from CSV

#### Projects
- `GET /api/v1/project` - List all projects
- `GET /api/v1/project/{id}` - Get project details
- `POST /api/v1/project` - Create a project
- `PUT /api/v1/project/{id}` - Update a project
- `DELETE /api/v1/project/{id}` - Delete a project
- `GET /api/v1/project/export-csv` - Export projects as CSV
- `POST /api/v1/project/import-csv` - Import projects from CSV

#### Users
- `GET /api/v1/user` - List all users
- `GET /api/v1/user/{id}` - Get user details
- `POST /api/v1/user` - Create a user
- `PUT /api/v1/user/{id}` - Update a user
- `DELETE /api/v1/user/{id}` - Delete a user
- `GET /api/v1/user/export-csv` - Export users as CSV
- `POST /api/v1/user/import-csv` - Import users from CSV

#### Time Entries
- `GET /api/v1/time-entry` - List all time entries (with optional filters)
- `GET /api/v1/time-entry/{id}` - Get time entry details
- `POST /api/v1/time-entry` - Create a time entry
- `POST /api/v1/time-entry/bulk` - Create multiple time entries
- `PUT /api/v1/time-entry/{id}` - Update a time entry
- `DELETE /api/v1/time-entry/{id}` - Delete a time entry
- `GET /api/v1/time-entry/export-csv` - Export time entries as CSV
- `POST /api/v1/time-entry/import-csv` - Import time entries from CSV

#### Stats
- `GET /api/v1/stats` - Aggregated statistics

#### Available filters for time entries
- `user_id` - Filter by user
- `project_id` - Filter by project
- `week_number` - Filter by week number
- `year` - Filter by year

## Prerequisites

- Docker
- Docker Compose

## Configuration

1. Copy the environment file:

```bash
cp .env.example .env
```

2. Edit `.env` as needed (optional for development)

## Starting with Docker Compose

```bash
# Build and start all services
docker compose -f compose.yml up --build

# Or in the background
docker compose -f compose.yml up -d --build
```

## Development Mode (watch + live reload)

```bash
# Docker Compose v2 (recommended)
docker compose -f compose.dev.yml up --build --watch
```

This mode enables:
- **Flask backend** in `--debug` mode (auto-reload on every change)
- **React frontend** with hot reload
- **Docker Compose watch** (file sync + rebuild when dependencies change)

Services will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **MariaDB**: localhost:3306

## Database Initialization

```bash
# Connect to the backend container
docker exec -it pointage_backend bash

# Tables are created automatically on application startup
flask seed-dev

# If the schema changes (no migration tool), reset the database
flask init-db --reset
flask seed-dev
```

## Stopping Services

```bash
docker compose -f compose.yml down

# Also remove volumes (data)
docker compose -f compose.yml down -v
```

## Development Data (`seed-dev`)

The `flask seed-dev` command populates the database with a complete dataset covering all application features.

### Tracking Codes (7)

| Code | Role |
|------|------|
| `DEV` | Development |
| `BUG` | Bug fixes |
| `DOC` | Documentation / Training |
| `RUN` | Infrastructure / Operations |
| `MEET` | Meetings / Rituals |
| `ABS` | Absences |
| `ARCV` | Archived code with no project (tests deletion without 409 conflict) |

### Projects (11)

| Project | Code | Pattern | Notes |
|---------|------|---------|-------|
| Client Portal | DEV | solid | — |
| Billing API | BUG | dotted | — |
| Mobile App | DEV | dotted | — |
| UI Redesign | DOC | solid | — |
| CI/CD Infra | RUN | solid | — |
| Team Rituals | MEET | dotted | — |
| Public Holiday | ABS | striped | Absence |
| RTT | ABS | striped | Absence |
| Sick Leave | ABS | striped | Absence |
| Azure Training | DOC | solid | — |
| Tech Watch | DOC | solid | **No time entries** — tests the UI for an empty project |

All three visual patterns (`solid`, `dotted`, `striped`) are covered.

### Users (5)

| Name | Color | OIDC `sub` |
|------|-------|------------|
| Alice Martin | `#3b82f6` | — |
| Yassine Benali | `#14b8a6` | — |
| Sophie Leroy | `#a855f7` | — |
| Thomas Bernard | `#f59e0b` | — |
| Camille Dupont | `#ef4444` | `oidc-sub-camille-001` (tests OIDC uniqueness constraint) |

### Time Entries (≈ 84)

Time entries cover **5 weeks** (week−3 to week+1 relative to the current date) and illustrate all edge cases:

| Test case | Description |
|-----------|-------------|
| Full-day | `morning → evening` on a single day |
| Morning half-day | `morning → midday` |
| Afternoon half-day | `midday → evening` |
| Multi-day block | e.g. Tuesday → Thursday (Gantt / merge test) |
| Cross-day | `Monday midday → Tuesday evening` (half-day overlap across two days) |
| RTT | Alice Wed week−1, Camille Wed week−1, Alice Mon week+1 |
| Public holiday | Thomas Mon week−1 (note: "Easter Monday") |
| Sick leave | Yassine Thu-Fri week−1 (multi-day + medical note) |
| Notes | 6 annotated entries (critical bug, training, absences) |
| Partial current week | Only days up to today are filled |
| Future planning | Alice RTT + Thomas full training week (week+1) |

## Local Development without Docker

### Backend (Flask)

```bash
cd backend
pip install -r requirements.txt
flask run
```

### Frontend (React)

```bash
cd frontend
npm install
npm start
```

## Python Type Checking (ty)

```bash
# From the project root
pip install ty

# Check the backend
ty check backend/app
```

Centralized configuration in `pyproject.toml` under `[tool.ty]`.

## Technical Notes

- **ISO 8601 weeks**: Week numbers follow the ISO standard (week starts on Monday)
- **Day precision**: Stored as DECIMAL(5,2) to support half-days
- **Colors**: Strict #RRGGBB hexadecimal format validated server-side
- **CORS**: Configured to accept requests from the React frontend
- **DB schema**: Tables are created automatically at startup via SQLAlchemy (`db.create_all()`)
