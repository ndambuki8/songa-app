from __future__ import annotations

import asyncio

import httpx

from songa.engines import NearbyPlace
from songa.services.places import WikipediaPlaces


def _places(handler) -> WikipediaPlaces:
    return WikipediaPlaces(http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def test_wikipedia_places_parses_and_sorts():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["params"] = dict(request.url.params)
        return httpx.Response(
            200,
            json={
                "query": {
                    "geosearch": [
                        {"title": "City Hall", "dist": 240.4},
                        {"title": "KICC", "dist": 119.6},
                        {"title": "  "},
                        "junk",
                    ]
                }
            },
        )

    result = asyncio.run(_places(handler).nearby(-1.28889, 36.82333))
    assert result == [NearbyPlace("KICC", 120), NearbyPlace("City Hall", 240)]
    assert seen["params"]["list"] == "geosearch"
    assert seen["params"]["gscoord"] == "-1.28889|36.82333"


def test_wikipedia_places_returns_empty_on_failure():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="down")

    assert asyncio.run(_places(handler).nearby(0, 0)) == []

    def broken(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    assert asyncio.run(_places(broken).nearby(0, 0)) == []


def test_wikipedia_places_caches_nearby_points_but_not_failures():
    calls = {"count": 0, "fail": True}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["fail"]:
            return httpx.Response(500)
        return httpx.Response(200, json={"query": {"geosearch": [{"title": "KICC", "dist": 40}]}})

    places = _places(handler)

    async def scenario():
        assert await places.nearby(-1.28889, 36.82333) == []  # failure is not cached
        calls["fail"] = False
        first = await places.nearby(-1.28889, 36.82333)
        again = await places.nearby(-1.28901, 36.82341)  # same ~100 m cell
        return first, again

    first, again = asyncio.run(scenario())
    assert first == again == [NearbyPlace("KICC", 40)]
    assert calls["count"] == 2


def test_user_agent_carries_contact():
    from songa.services.places import user_agent

    assert "(me@example.org;" in user_agent("me@example.org")
    assert "github.com/ndambuki8/songa-app" in user_agent("  ")
