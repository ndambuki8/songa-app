from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from songa.core.errors import (
    BadPayload,
    PayloadTooLarge,
    ServiceMisconfigured,
    UpstreamModelError,
    UpstreamTimeout,
    UpstreamUnavailable,
)
from songa.core.media import decode_base64_payload
from songa.llm.muse_client import MuseWonderClient
from songa.llm.structured import extract_json_object
from songa.routes.logbook import utc_offset


def test_extract_json_object_handles_fences_and_prose():
    assert extract_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json_object('Here it is: {"a": {"b": [1, 2]}} hope that helps') == {"a": {"b": [1, 2]}}
    with pytest.raises(ValueError):
        extract_json_object("no braces here")


def test_decode_base64_payload_limits_and_data_urls():
    assert decode_base64_payload("data:image/jpeg;base64,aGVsbG8=", max_bytes=100, label="image") == b"hello"
    with pytest.raises(PayloadTooLarge):
        decode_base64_payload("A" * 400, max_bytes=100, label="audio")
    with pytest.raises(BadPayload):
        decode_base64_payload("", max_bytes=100, label="audio")


def test_utc_offset():
    assert utc_offset("2026-10-29", "Asia/Tokyo") == "+09:00"
    assert utc_offset("2026-10-29", "Africa/Nairobi") == "+03:00"
    assert utc_offset("2026-10-29", "Not/AZone") == "+00:00"


def _client(handler) -> MuseWonderClient:
    return MuseWonderClient(
        api_key="k",
        base_url="https://api.meta.ai/v1/",
        model="muse-wonder-1.0",
        reasoning_effort="low",
        json_mode=True,
        timeout_s=5,
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )


def test_muse_client_sends_openai_compatible_request():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    text = asyncio.run(_client(handler).complete([{"role": "user", "content": "hi"}], max_tokens=50))
    assert text == '{"ok": true}'
    assert seen["url"] == "https://api.meta.ai/v1/chat/completions"
    assert seen["auth"] == "Bearer k"
    assert seen["body"]["model"] == "muse-wonder-1.0"
    assert seen["body"]["max_completion_tokens"] == 50
    assert seen["body"]["response_format"] == {"type": "json_object"}
    assert seen["body"]["reasoning_effort"] == "low"


def test_muse_client_flattens_content_parts():
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]}}]})

    assert asyncio.run(_client(handler).complete([], max_tokens=5)) == "ab"


@pytest.mark.parametrize(
    ("status", "error"),
    [(429, UpstreamUnavailable), (401, ServiceMisconfigured), (500, UpstreamModelError)],
)
def test_muse_client_maps_http_errors(status, error):
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": "x"})

    with pytest.raises(error):
        asyncio.run(_client(handler).complete([], max_tokens=5))


def test_muse_client_maps_timeouts():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(UpstreamTimeout):
        asyncio.run(_client(handler).complete([], max_tokens=5))


def test_muse_client_requires_key():
    client = MuseWonderClient(api_key="", base_url="https://x", model="m", reasoning_effort=None, json_mode=False, timeout_s=1)
    with pytest.raises(ServiceMisconfigured):
        asyncio.run(client.complete([], max_tokens=5))
