"""JWT authentication middleware for the Flask API.

When ``OIDC_ISSUER`` is configured every request to ``/api/*`` must carry a
valid Bearer token issued by that OIDC provider.  The JWKS keys used for
signature verification are cached in memory for ``JWKS_CACHE_TTL`` seconds
and refreshed automatically when a token's ``kid`` is not found in the cache.

When ``OIDC_ISSUER`` is *not* set the middleware is a no-op (open access),
preserving full backwards-compatibility.
"""

import threading
import time

import jwt
import requests as http_requests
from flask import current_app, g, jsonify, request

# ---------------------------------------------------------------------------
# JWKS cache — shared across all requests, protected by a mutex
# ---------------------------------------------------------------------------

_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}
_jwks_lock = threading.Lock()

JWKS_CACHE_TTL = 3600  # seconds


def _fetch_jwks(issuer: str) -> list:
    """Return the list of JWK objects from *issuer*'s JWKS endpoint.

    Results are cached in-process for ``JWKS_CACHE_TTL`` seconds.
    """
    with _jwks_lock:
        now = time.monotonic()
        if (
            _jwks_cache["keys"] is None
            or (now - _jwks_cache["fetched_at"]) >= JWKS_CACHE_TTL
        ):
            discovery_url = (
                f"{issuer.rstrip('/')}/.well-known/openid-configuration"
            )
            discovery = http_requests.get(discovery_url, timeout=10).json()
            jwks_uri = discovery["jwks_uri"]
            jwks = http_requests.get(jwks_uri, timeout=10).json()
            _jwks_cache["keys"] = jwks["keys"]
            _jwks_cache["fetched_at"] = now
        return _jwks_cache["keys"]


def _get_public_key(token: str, issuer: str):
    """Return the RSA public key that matches the token's ``kid`` header.

    If the key is not found in the cached JWKS the cache is force-refreshed
    once before raising ``ValueError``.
    """
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")

    def _find(keys):
        for key_data in keys:
            if kid is None or key_data.get("kid") == kid:
                return jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
        return None

    public_key = _find(_fetch_jwks(issuer))
    if public_key is not None:
        return public_key

    # Force cache refresh and try once more
    with _jwks_lock:
        _jwks_cache["fetched_at"] = 0.0
    public_key = _find(_fetch_jwks(issuer))
    if public_key is not None:
        return public_key

    raise ValueError(f"No matching JWK found for kid={kid!r}")


# ---------------------------------------------------------------------------
# Flask before_request hook
# ---------------------------------------------------------------------------


def validate_token():
    """Flask ``before_request`` hook that enforces Bearer-token authentication.

    Returns ``None`` to let the request proceed, or a ``(Response, 401)``
    tuple to abort it.
    """
    issuer = current_app.config.get("OIDC_ISSUER")
    if not issuer:
        return None  # OIDC not configured — open access

    # The health-check must always be reachable without a token.
    if request.path == "/health":
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Authentication required"}), 401

    token = auth_header[7:]
    try:
        audience = current_app.config.get("OIDC_AUDIENCE")
        public_key = _get_public_key(token, issuer)
        options: dict = {}
        if not audience:
            options["verify_aud"] = False
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer=issuer,
            audience=audience,
            options=options,
        )
        g.oidc_sub = payload.get("sub")
        return None
    except (
        jwt.ExpiredSignatureError,
        jwt.InvalidTokenError,
        ValueError,
    ) as exc:
        current_app.logger.warning("Token validation failed: %s", exc)
        return jsonify({"error": "Invalid or expired token"}), 401
