from __future__ import annotations

import logging
from typing import Any

import httpx

from songa.core.errors import ServiceMisconfigured, UpstreamModelError, UpstreamTimeout, UpstreamUnavailable
from songa.engines import ChatMessage

logger = logging.getLogger(__name__)


class MuseWonderClient:
    """Async client for Meta Muse Wonder over the OpenAI-compatible Meta Model API Chat Completions endpoint."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        reasoning_effort: str | None,
        json_mode: bool,
        timeout_s: float,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._model = model
        self._reasoning_effort = reasoning_effort or None
        self._json_mode = json_mode
        self._http = http or httpx.AsyncClient(timeout=httpx.Timeout(timeout_s, connect=10.0))

    async def aclose(self) -> None:
        await self._http.aclose()

    async def complete(
        self, messages: list[ChatMessage], *, max_tokens: int, reasoning_effort: str | None = None
    ) -> str:
        if not self._api_key:
            raise ServiceMisconfigured("META_API_KEY is not configured on the server.")

        body: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
        }
        effort = reasoning_effort or self._reasoning_effort
        if effort:
            body["reasoning_effort"] = effort
        if self._json_mode:
            body["response_format"] = {"type": "json_object"}

        try:
            response = await self._http.post(
                self._url,
                json=body,
                headers={"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"},
            )
        except httpx.TimeoutException as exc:
            raise UpstreamTimeout("Muse Wonder did not respond in time.") from exc
        except httpx.HTTPError as exc:
            raise UpstreamUnavailable("Could not reach the Meta Model API.") from exc

        if response.status_code == 429:
            raise UpstreamUnavailable("Muse Wonder is rate limited. Try again shortly.", code="upstream_rate_limited")
        if response.status_code in (401, 403):
            logger.error("Meta Model API rejected credentials: %s", response.text[:300])
            raise ServiceMisconfigured("The server's Meta Model API key was rejected.")
        if response.status_code >= 400:
            logger.error("Meta Model API error %s: %s", response.status_code, response.text[:500])
            raise UpstreamModelError(f"Muse Wonder returned HTTP {response.status_code}.")

        try:
            payload = response.json()
            content = payload["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise UpstreamModelError("Muse Wonder returned an unreadable response.") from exc

        text = _flatten_content(content)
        if not text.strip():
            raise UpstreamModelError("Muse Wonder returned an empty response.")
        return text


def _flatten_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""
