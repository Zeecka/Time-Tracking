"""
Shared pytest fixtures for unit/integration tests.

Uses an in-memory SQLite database so no MySQL server is required.
Each test function gets a fresh empty database (create_all / drop_all per
function) to guarantee full isolation without needing nested transactions.
"""

import pytest
from app import create_app
from app.extensions import db as _db
from app.models import CodePointage, Projet, Utilisateur


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
    code = CodePointage(code="DEV")
    db.session.add(code)
    db.session.flush()
    return code


@pytest.fixture()
def code_abs(db):
    code = CodePointage(code="ABS")
    db.session.add(code)
    db.session.flush()
    return code


@pytest.fixture()
def projet_dev(db, code_dev):
    projet = Projet(
        nom="Développement",
        couleur="#3498db",
        motif="uni",
        code_pointage_id=code_dev.id,
    )
    db.session.add(projet)
    db.session.flush()
    return projet


@pytest.fixture()
def projet_bug(db, code_dev):
    projet = Projet(
        nom="Bug Fix",
        couleur="#e74c3c",
        motif="raye",
        code_pointage_id=code_dev.id,
    )
    db.session.add(projet)
    db.session.flush()
    return projet


@pytest.fixture()
def projet_abs(db, code_abs):
    projet = Projet(
        nom="Absence",
        couleur="#95a5a6",
        motif="pointille",
        code_pointage_id=code_abs.id,
    )
    db.session.add(projet)
    db.session.flush()
    return projet


@pytest.fixture()
def utilisateur_alice(db):
    u = Utilisateur(nom="Alice", couleur="#2ecc71")
    db.session.add(u)
    db.session.flush()
    return u


@pytest.fixture()
def utilisateur_bob(db):
    u = Utilisateur(nom="Bob", couleur="#9b59b6")
    db.session.add(u)
    db.session.flush()
    return u
