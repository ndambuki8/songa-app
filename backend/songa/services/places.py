"""Nearby notable places from the Wikipedia GeoSearch API (no key required).

Used to ground "where am I?" answers: the vision model cross-checks what it sees in the photo against the
landmarks that actually exist around the traveler, instead of guessing from pixels alone.
"""

from __future__ import annotations

import logging
import time
from collections import OrderedDict

import httpx

from songa.engines import NearbyPlace

logger = logging.getLogger(__name__)

# Wikimedia rejects (HTTP 403) API clients whose User-Agent lacks contact details:
# https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
# Set SONGA_CONTACT to an email or URL you own to override the repository link.
DEFAULT_CONTACT = "https://github.com/ndambuki8/songa-app"


def user_agent(contact: str = DEFAULT_CONTACT) -> str:
    return f"SongaBot/1.0 ({contact.strip() or DEFAULT_CONTACT}; travel companion nearby-places lookup) httpx/{httpx.__version__}"


USER_AGENT = user_agent()
CACHE_TTL_S = 60 * 60
CACHE_SIZE = 256


class WikipediaPlaces:
    def __init__(
        self,
        *,
        radius_m: int = 1000,
        limit: int = 12,
        timeout_s: float = 2.5,
        language: str = "en",
        contact: str = DEFAULT_CONTACT,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self._url = f"https://{language}.wikipedia.org/w/api.php"
        self._radius_m = max(10, min(radius_m, 10_000))
        self._limit = max(1, min(limit, 50))
        self._http = http or httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_s), headers={"User-Agent": user_agent(contact)}
        )
        self._cache: OrderedDict[tuple[float, float], tuple[float, list[NearbyPlace]]] = OrderedDict()

    async def aclose(self) -> None:
        await self._http.aclose()

    async def nearby(self, latitude: float, longitude: float) -> list[NearbyPlace]:
        # Travelers ask several questions from the same spot; ~100 m cells keep repeat lookups instant.
        key = (round(latitude, 3), round(longitude, 3))
        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] < CACHE_TTL_S:
            self._cache.move_to_end(key)
            return list(cached[1])

        places = await self._fetch(latitude, longitude)
        if places:
            self._cache[key] = (time.monotonic(), places)
            self._cache.move_to_end(key)
            while len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        return list(places)

    async def _fetch(self, latitude: float, longitude: float) -> list[NearbyPlace]:
        params = {
            "action": "query",
            "list": "geosearch",
            "gscoord": f"{latitude:.5f}|{longitude:.5f}",
            "gsradius": str(self._radius_m),
            "gslimit": str(self._limit),
            "format": "json",
        }
        try:
            response = await self._http.get(self._url, params=params)
            response.raise_for_status()
            results = response.json().get("query", {}).get("geosearch", [])
        except (httpx.HTTPError, ValueError, AttributeError) as exc:
            logger.warning("Wikipedia geosearch failed: %s", exc)
            return []

        places: list[NearbyPlace] = []
        for item in results:
            title = item.get("title") if isinstance(item, dict) else None
            if not isinstance(title, str) or not title.strip():
                continue
            try:
                distance = int(round(float(item.get("dist", 0))))
            except (TypeError, ValueError):
                distance = 0
            places.append(NearbyPlace(name=title.strip(), distance_m=distance))
        places.sort(key=lambda place: place.distance_m)
        return places
