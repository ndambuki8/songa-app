"""Helpers for newline-delimited JSON streaming responses."""

from __future__ import annotations

import json

NDJSON_MEDIA_TYPE = "application/x-ndjson"
# `X-Accel-Buffering: no` stops proxies from holding back early events.
NDJSON_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def ndjson_line(event: dict[str, object]) -> bytes:
    return (json.dumps(event, ensure_ascii=False) + "\n").encode()
