from __future__ import annotations

import hmac

from fastapi import Header, Request

from songa.config import Settings
from songa.core.errors import ServiceMisconfigured, Unauthorized


def require_api_key(request: Request, authorization: str | None = Header(default=None)) -> None:
    settings: Settings = request.app.state.settings
    if not settings.api_key:
        if settings.allow_unauthenticated:
            return
        raise ServiceMisconfigured("SONGA_API_KEY is not configured on the server.")

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.strip(), settings.api_key):
        raise Unauthorized("Missing or invalid API key.")
