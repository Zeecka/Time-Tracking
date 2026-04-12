"""Tests for the JWT authentication middleware (app/auth.py).

All key generation and JWT signing are done entirely in-process — no external
OIDC provider is required.

Scenario A (no OIDC): ``OIDC_ISSUER`` is *not* set → every request is open.
Scenario B (OIDC on): ``OIDC_ISSUER`` is set and JWKS fetching is mocked.
"""

import json
import time
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from app import create_app
from app.extensions import db as _db

ISSUER = "https://auth.example.com"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _generate_rsa_keypair():
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    return private_key, private_key.public_key()


def _make_token(private_key, *, issuer, audience=None, sub="test-sub", expired=False):
    now = int(time.time())
    payload = {
        "iss": issuer,
        "sub": sub,
        "iat": now - 10,
        "exp": now - 5 if expired else now + 3600,
    }
    if audience:
        payload["aud"] = audience
    return jwt.encode(payload, private_key, algorithm="RS256")


def _build_fake_jwks(public_key, kid="test-kid"):
    """Build a minimal JWKS list that PyJWT can use for verification."""
    key_data = json.loads(RSAAlgorithm.to_jwk(public_key))
    key_data["kid"] = kid
    key_data["use"] = "sig"
    return [key_data]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def rsa_keypair():
    return _generate_rsa_keypair()


@pytest.fixture(scope="module")
def oidc_app(rsa_keypair):
    """Flask app with OIDC_ISSUER configured."""
    app = create_app("testing")
    app.config["OIDC_ISSUER"] = ISSUER
    return app


@pytest.fixture()
def oidc_db(oidc_app):
    with oidc_app.app_context():
        _db.create_all()
        yield _db
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def oidc_client(oidc_app, oidc_db, rsa_keypair):
    """Test client with OIDC enabled; JWKS fetching is mocked."""
    private_key, public_key = rsa_keypair
    fake_jwks = _build_fake_jwks(public_key)
    with patch("app.auth._fetch_jwks", return_value=fake_jwks):
        with oidc_app.test_client() as c:
            yield c, private_key


# ---------------------------------------------------------------------------
# Scenario A: no OIDC configured (open access)
# ---------------------------------------------------------------------------


class TestNoOidc:
    def test_api_accessible_without_token(self, client):
        """Without OIDC_ISSUER every API route is open."""
        rv = client.get("/api/v1/user")
        assert rv.status_code == 200

    def test_health_accessible_without_token(self, client):
        rv = client.get("/health")
        assert rv.status_code == 200


# ---------------------------------------------------------------------------
# Scenario B: OIDC enabled
# ---------------------------------------------------------------------------


class TestOidcEnabled:
    def test_missing_token_returns_401(self, oidc_client):
        c, _ = oidc_client
        rv = c.get("/api/v1/user")
        assert rv.status_code == 401
        assert b"Authentication required" in rv.data

    def test_malformed_bearer_returns_401(self, oidc_client):
        c, _ = oidc_client
        rv = c.get("/api/v1/user", headers={"Authorization": "Bearer not-a-jwt"})
        assert rv.status_code == 401

    def test_wrong_scheme_returns_401(self, oidc_client):
        c, private_key = oidc_client
        token = _make_token(private_key, issuer=ISSUER)
        rv = c.get("/api/v1/user", headers={"Authorization": f"Basic {token}"})
        assert rv.status_code == 401

    def test_valid_token_allows_access(self, oidc_client):
        c, private_key = oidc_client
        token = _make_token(private_key, issuer=ISSUER)
        rv = c.get("/api/v1/user", headers={"Authorization": f"Bearer {token}"})
        assert rv.status_code == 200

    def test_expired_token_returns_401(self, oidc_client):
        c, private_key = oidc_client
        token = _make_token(private_key, issuer=ISSUER, expired=True)
        rv = c.get("/api/v1/user", headers={"Authorization": f"Bearer {token}"})
        assert rv.status_code == 401

    def test_wrong_issuer_returns_401(self, oidc_client):
        c, private_key = oidc_client
        token = _make_token(private_key, issuer="https://evil.example.com")
        rv = c.get("/api/v1/user", headers={"Authorization": f"Bearer {token}"})
        assert rv.status_code == 401

    def test_health_bypasses_auth(self, oidc_client):
        """Health-check endpoint must remain accessible without a token."""
        c, _ = oidc_client
        rv = c.get("/health")
        assert rv.status_code == 200

    def test_valid_token_with_audience(self, oidc_app, oidc_db, rsa_keypair):
        """When OIDC_AUDIENCE is set the token's aud claim must match."""
        private_key, public_key = rsa_keypair
        fake_jwks = _build_fake_jwks(public_key)
        oidc_app.config["OIDC_AUDIENCE"] = "my-client"

        with patch("app.auth._fetch_jwks", return_value=fake_jwks):
            with oidc_app.test_client() as c:
                # Token with correct audience
                token_ok = _make_token(
                    private_key, issuer=ISSUER, audience="my-client"
                )
                rv = c.get(
                    "/api/v1/user",
                    headers={"Authorization": f"Bearer {token_ok}"},
                )
                assert rv.status_code == 200

                # Token with wrong audience
                token_bad = _make_token(
                    private_key, issuer=ISSUER, audience="other-client"
                )
                rv = c.get(
                    "/api/v1/user",
                    headers={"Authorization": f"Bearer {token_bad}"},
                )
                assert rv.status_code == 401

        # Restore to no audience so other tests are unaffected
        oidc_app.config["OIDC_AUDIENCE"] = None
