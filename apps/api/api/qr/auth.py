"""Server-side verification of the caller's identity and role.

The rest of the API derives the actor from `x-lumina-user-id` / `x-lumina-role`
request headers, which the client sets and the server never checks — anyone can
claim to be a doctor. That is tolerable for endpoints where the worst case is a
junk submission. It is not tolerable for record access, so this module verifies
the Clerk session JWT instead and takes the role from Clerk's `publicMetadata`,
which only the backend can write.

Deliberately self-contained: adopting it elsewhere is a one-line swap of `_actor`,
but doing that requires every caller to send the token, so it is opt-in per route
rather than a change that could break unrelated endpoints.
"""

import base64
import logging
import os
import time
from functools import lru_cache

import jwt
from fastapi import HTTPException, Request
from jwt import PyJWKClient

logger = logging.getLogger(__name__)

# Clerk signs session tokens with RS256 and publishes the keys at the instance's
# well-known JWKS endpoint.
_JWKS_CACHE_SECONDS = 600


def _frontend_api_host() -> str | None:
    """Derive the Clerk instance host from the publishable key.

    A publishable key is `pk_test_<base64 of "host$">`, so the JWKS endpoint can
    be derived without another environment variable to keep in sync.
    """
    pk = os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "").strip()
    if not pk:
        return None
    _, _, encoded = pk.partition("_test_")
    if not encoded:
        _, _, encoded = pk.partition("_live_")
    if not encoded:
        return None
    try:
        padded = encoded + "=" * (-len(encoded) % 4)
        host = base64.b64decode(padded).decode("utf-8").rstrip("$")
        return host or None
    except Exception:
        return None


@lru_cache(maxsize=1)
def _jwk_client() -> PyJWKClient | None:
    host = _frontend_api_host()
    if not host:
        return None
    return PyJWKClient(f"https://{host}/.well-known/jwks.json", lifespan=_JWKS_CACHE_SECONDS)


_ROLE_TTL_SECONDS = 300
_role_cache: dict[str, tuple[str | None, float]] = {}


def _role_from_clerk(user_id: str) -> str | None:
    """Look up publicMetadata.role via the Clerk Backend API.

    Cached briefly so a burst of requests is one call, but short enough that
    revoking a doctor's role takes effect within minutes rather than needing a
    restart.
    """
    cached = _role_cache.get(user_id)
    if cached and cached[1] > time.time():
        return cached[0]

    secret = os.environ.get("CLERK_SECRET_KEY", "").strip()
    if not secret:
        return None

    role: str | None = None
    try:
        import urllib.request

        req = urllib.request.Request(
            f"https://api.clerk.com/v1/users/{user_id}",
            headers={
                "Authorization": f"Bearer {secret}",
                # Clerk rejects urllib's default user-agent with 403, which
                # silently turned every role lookup into "no assigned role".
                "User-Agent": "lumina-api",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            import json

            payload = json.loads(resp.read())
        value = (payload.get("public_metadata") or {}).get("role")
        role = value if value in {"doctor", "patient"} else None
    except Exception:
        # Leave role unset; the caller turns that into a 403 rather than
        # assuming a role on a failed lookup.
        role = None

    _role_cache[user_id] = (role, time.time() + _ROLE_TTL_SECONDS)
    return role


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def verified_actor(request: Request) -> tuple[str, str]:
    """Return (user_id, role) proven by a Clerk session token.

    Raises 401 when the token is missing or invalid, and 403 when the account
    carries no role — an unroled account should not silently inherit one.
    """
    token = _bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Sign-in required")

    client = _jwk_client()
    if client is None:
        # Refuse rather than fall back to unverified headers: failing closed is
        # the whole point of this module.
        raise HTTPException(status_code=500, detail="Auth is not configured on the server")

    try:
        signing_key = client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
            # Clerk tokens are short-lived and issued by a server whose clock may
            # be marginally ahead of ours; without leeway a freshly minted token
            # can be rejected as not-yet-valid.
            leeway=60,
        )
    except Exception as exc:
        # The reason matters when diagnosing a rejected sign-in, and a generic
        # 401 hides it entirely.
        logger.warning("Clerk token rejected: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc

    if claims.get("exp") and claims["exp"] < time.time():
        raise HTTPException(status_code=401, detail="Session expired")

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Session is missing a subject")

    # A default Clerk session token carries no publicMetadata, so prefer the claim
    # when a JWT template supplies it and otherwise ask Clerk directly. The token
    # has already proven *who* the caller is; this establishes what they may do.
    metadata = claims.get("publicMetadata") or claims.get("public_metadata") or {}
    role = (metadata or {}).get("role") or claims.get("role") or _role_from_clerk(user_id)

    if role not in {"doctor", "patient"}:
        raise HTTPException(
            status_code=403,
            detail="Your account has no assigned role. Contact an administrator.",
        )

    return user_id, role


def require_role(request: Request, expected: str) -> str:
    user_id, role = verified_actor(request)
    if role != expected:
        raise HTTPException(status_code=403, detail=f"Only {expected}s can perform this action")
    return user_id
