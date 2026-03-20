"""
Shared pytest fixtures for unit/integration tests.

Uses an in-memory SQLite database so no MySQL server is required.
Each test function gets a fresh empty database (create_all / drop_all per
function) to guarantee full isolation without needing nested transactions.
"""

import pytest
from app import create_app
from app.extensions import db as _db
from app.models import Project, TrackingCode, User


@pytest.fixture(scope="session")
def app():
    """Create the Flask application with testing config (in-memory SQLite)."""
    test_app = create_app("testing")
    return test_app


@pytest.fixture(scope="function")
def db(app):
    """Provide a fresh database for each test, then tear it down."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.remove()
        _db.drop_all()


@pytest.fixture(scope="function")
def client(app, db):
    """Flask test client with a fresh DB for each test."""
    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Entity fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def code_dev(db):
    code = TrackingCode(code="DEV")
    db.session.add(code)
    db.session.flush()
    return code


@pytest.fixture()
def code_abs(db):
    code = TrackingCode(code="ABS")
    db.session.add(code)
    db.session.flush()
    return code


@pytest.fixture()
def project_dev(db, code_dev):
    project = Project(
        name="Development",
        color="#3498db",
        pattern="solid",
        tracking_code_id=code_dev.id,
    )
    db.session.add(project)
    db.session.flush()
    return project


@pytest.fixture()
def project_bug(db, code_dev):
    project = Project(
        name="Bug Fix",
        color="#e74c3c",
        pattern="striped",
        tracking_code_id=code_dev.id,
    )
    db.session.add(project)
    db.session.flush()
    return project


@pytest.fixture()
def project_abs(db, code_abs):
    project = Project(
        name="Absence",
        color="#95a5a6",
        pattern="dotted",
        tracking_code_id=code_abs.id,
    )
    db.session.add(project)
    db.session.flush()
    return project


@pytest.fixture()
def user_alice(db):
    u = User(name="Alice", color="#2ecc71")
    db.session.add(u)
    db.session.flush()
    return u


@pytest.fixture()
def user_bob(db):
    u = User(name="Bob", color="#9b59b6")
    db.session.add(u)
    db.session.flush()
    return u
