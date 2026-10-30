from __future__ import annotations

from fastapi import Request

from songa.config import Settings
from songa.engines import Engines


def get_engines(request: Request) -> Engines:
    return request.app.state.engines


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def language_code(locale: str | None) -> str | None:
    """Reduces a BCP-47 locale such as `ja-JP` to its ISO 639 language code."""
    if not locale:
        return None
    return locale.split("-", 1)[0].lower() or None
