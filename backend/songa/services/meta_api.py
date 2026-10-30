"""Shared HTTP plumbing for the Meta Model API media endpoints (SAM 3.1 and Muse Voice Transcribe)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from songa.core.errors import (
    PayloadTooLarge,
    ServiceMisconfigured,
    SongaError,
    UpstreamModelError,
    UpstreamTimeout,
    UpstreamUnavailable,
)

logger = logging.getLogger(__name__)


class MetaApiClient:
    def __init__(self, *, api_key: str, base_url: str, timeout_s: float, http: httpx.AsyncClient | None = None) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = http or httpx.AsyncClient(timeout=httpx.Timeout(timeout_s, connect=10.0))

    async def aclose(self) -> None:
        await self._http.aclose()

    async def post(
        self,
        path: str,
        *,
        service: str,
        json: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
        bad_request: SongaError | None = None,
    ) -> Any:
        """POSTs to the Meta Model API and returns the decoded JSON body, mapping failures to HTTP semantics.

        `bad_request` replaces the default 502 when the API rejects the request with a 400, because a 400 on
        media endpoints usually means the traveler's audio or photo was unusable.
        """
        if not self._api_key:
            raise ServiceMisconfigured("META_API_KEY is not configured on the server.")

        try:
            response = await self._http.post(
                f"{self._base_url}{path}",
                json=json,
                files=files,
                headers={"Authorization": f"Bearer {self._api_key}", "Accept": "application/json"},
            )
        except httpx.TimeoutException as exc:
            raise UpstreamTimeout(f"{service} did not respond in time.") from exc
        except httpx.HTTPError as exc:
            raise UpstreamUnavailable("Could not reach the Meta Model API.") from exc

        status = response.status_code
        if status >= 400:
            logger.error("%s HTTP %s: %s", service, status, response.text[:500])
        if status == 400 and bad_request is not None:
            raise bad_request
        if status in (401, 403):
            raise ServiceMisconfigured("The server's Meta Model API key was rejected.")
        if status == 404:
            raise ServiceMisconfigured(f"{service} is not available to this Meta Model API key.")
        if status == 413:
            raise PayloadTooLarge(f"The upload is too large for {service}.")
        if status == 429:
            raise UpstreamUnavailable(f"{service} is rate limited. Try again shortly.", code="upstream_rate_limited")
        if status >= 400:
            raise UpstreamModelError(f"{service} returned HTTP {status}.")

        try:
            return response.json()
        except ValueError as exc:
            raise UpstreamModelError(f"{service} returned an unreadable response.") from exc
