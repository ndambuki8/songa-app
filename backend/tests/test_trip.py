from __future__ import annotations

import json

from fastapi.testclient import TestClient

from songa.gateway import create_app
from tests.fakes import AUTH, ScriptedLLM, build_engines, json_reply, make_settings


def client_for(llm: ScriptedLLM) -> TestClient:
    return TestClient(create_app(make_settings(), build_engines(llm)), raise_server_exceptions=False)


BRIEFING = {
    "summary": "Kyoto in autumn is busy around temples; mornings are quietest.",
    "days": [
        {"date": "2030-01-01", "title": "Arrive and settle in", "suggestions": ["Check in", "Walk Gion", "Dinner", "Bath", "Sleep"]},
        {"date": "wrong", "title": "Temples", "suggestions": ["Kiyomizu-dera at opening"]},
        {"date": "2026-11-05", "title": "Extra day the trip does not have", "suggestions": []},
    ],
    "phrases": [
        {"meaning": "Hello", "phrase": "こんにちは", "pronunciation": "konnichiwa"},
        {"meaning": "Empty", "phrase": "  ", "pronunciation": None},
    ],
    "etiquette": ["Do not tip.", " ", "Remove shoes indoors."],
    "safety": ["Watch for bicycles on pavements."],
    "money": ["Carry some cash, about 50 USD."],
    "getting_around": ["Buy an ICOCA card."],
    "emergency_numbers": [{"label": "Police", "number": "110"}, {"label": "Ambulance and fire", "number": "119"}],
}

REQUEST = {
    "destination": "  Kyoto ",
    "start_date": "2026-11-03",
    "days": 2,
    "stay": "Hotel Sakura",
    "needs": "peanut allergy",
    "traveler_locale": "en-US",
    "destination_locale": "ja-JP",
    "home_currency": "USD",
}


def test_trip_briefing_aligns_days_and_cleans_lists():
    llm = ScriptedLLM([json_reply(BRIEFING)])
    response = client_for(llm).post("/api/trip/briefing", json=REQUEST, headers=AUTH)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["destination"] == "Kyoto"
    assert body["destination_locale"] == "ja-JP"
    assert [day["date"] for day in body["days"]] == ["2026-11-03", "2026-11-04"]
    assert len(body["days"][0]["suggestions"]) == 4
    assert [p["phrase"] for p in body["phrases"]] == ["こんにちは"]
    assert body["etiquette"] == ["Do not tip.", "Remove shoes indoors."]
    assert body["emergency_numbers"][1]["number"] == "119"

    sent = json.loads(llm.requests[0][1]["content"])
    assert sent["trip_dates"] == ["2026-11-03", "2026-11-04"]
    assert sent["traveler_needs"] == "peanut allergy"
    assert sent["destination_language"] == "ja-JP"


def test_trip_briefing_rejects_impossible_dates_and_lengths():
    client = client_for(ScriptedLLM([]))
    bad_date = client.post("/api/trip/briefing", json={**REQUEST, "start_date": "2026-02-30"}, headers=AUTH)
    assert bad_date.status_code == 400
    assert bad_date.json()["error"]["code"] == "bad_payload"
    too_long = client.post("/api/trip/briefing", json={**REQUEST, "days": 30}, headers=AUTH)
    assert too_long.status_code == 422


def test_trip_briefing_requires_api_key():
    response = client_for(ScriptedLLM([])).post("/api/trip/briefing", json=REQUEST)
    assert response.status_code == 401
