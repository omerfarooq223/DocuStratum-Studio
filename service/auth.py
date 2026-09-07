import logging
import os
import secrets
from pathlib import Path
from typing import Optional, Set
from fastapi import Request, HTTPException, status

logger = logging.getLogger("webrag.auth")

AUTH_DIR = Path.home() / ".webrag"
AUTH_FILE = AUTH_DIR / "auth_token"

def get_allowed_extension_ids() -> Set[str]:
    """
    Returns configured allowed Chrome extension IDs from WEBRAG_ALLOWED_EXTENSION_IDS (comma-separated).
    If not set or empty, returns an empty set (permissive dev mode).
    """
    raw = os.getenv("WEBRAG_ALLOWED_EXTENSION_IDS", "").strip()
    if not raw or raw == "*":
        return set()
    return {eid.strip() for eid in raw.split(",") if eid.strip()}

def get_or_create_auth_token() -> Optional[str]:
    """
    Returns the auth token configured via environment variable or persistent user file.
    - If WEBRAG_AUTH_TOKEN is explicitly set to a non-empty string, uses that.
    - If WEBRAG_AUTH_TOKEN is explicitly set to empty, auth is disabled.
    - If WEBRAG_REQUIRE_AUTH is truthy, loads or generates ~/.webrag/auth_token.
    """
    env_token = os.getenv("WEBRAG_AUTH_TOKEN")
    if env_token is not None:
        token = env_token.strip()
        return token if token else None

    require_auth = os.getenv("WEBRAG_REQUIRE_AUTH", "").lower() in ("1", "true", "yes")
    if not require_auth:
        return None

    try:
        if AUTH_FILE.exists():
            token = AUTH_FILE.read_text(encoding="utf-8").strip()
            if token:
                return token
        AUTH_DIR.mkdir(parents=True, exist_ok=True)
        token = secrets.token_urlsafe(32)
        AUTH_FILE.write_text(token, encoding="utf-8")
        try:
            os.chmod(AUTH_FILE, 0o600)
        except OSError:
            pass
        logger.info("Generated new WebRAG companion session auth token at %s", AUTH_FILE)
        return token
    except Exception as e:
        logger.warning("Could not read/create session token file at %s: %s", AUTH_FILE, e)
        return None

def verify_bearer_token(request: Request) -> None:
    """
    Validates that request contains a valid bearer token matching the configured auth token.
    If auth is not enabled, this check passes without error.
    """
    expected_token = get_or_create_auth_token()
    if not expected_token:
        return

    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif request.headers.get("X-WebRAG-Token"):
        token = request.headers.get("X-WebRAG-Token", "").strip()

    if not token or not secrets.compare_digest(token, expected_token):
        request_id = getattr(request.state, "request_id", "unauthenticated")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing companion service authentication token. Provide Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
