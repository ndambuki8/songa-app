from __future__ import annotations

from fastapi.testclient import TestClient

from songa.gateway import create_app
from tests.fakes import (
    AUDIO_B64,
    AUTH,
    FakeSegmenter,
    FakeSpeechToText,
    ScriptedLLM,
    build_engines,
    json_reply,
    make_jpeg_b64,
    make_settings,
)

INTENT_OK = json_reply(
    {
        "extracted_intent": "The traveler wants directions to the train station.",
        "culturally_refined_translation": "すみません、駅はどちらでしょうか。",
        "politeness_notes": "Used polite keigo with an apologetic opener.",
    }
)


def client_for(llm: ScriptedLLM, **kwargs) -> TestClient:
    return TestClient(create_app(make_settings(), build_engines(llm, **kwargs)), raise_server_exceptions=False)


def test_health_is_public_and_timed():
    response = client_for(ScriptedLLM([])).get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "latency_ms" in response.json()
    assert "X-Songa-Latency-Ms" in response.headers


def test_protected_routes_require_api_key():
    client = client_for(ScriptedLLM([INTENT_OK]))
    body = {"audio_b64": AUDIO_B64, "target_locale": "ja-JP"}
    assert client.post("/api/dialogue/intent-bridge", json=body).status_code == 401
    wrong = client.post("/api/dialogue/intent-bridge", json=body, headers={"Authorization": "Bearer nope"})
    assert wrong.status_code == 401
    assert wrong.json()["error"]["code"] == "unauthorized"


def test_missing_server_key_fails_closed():
    from songa.config import Settings

    app = create_app(Settings(api_key=""), build_engines(ScriptedLLM([])))
    response = TestClient(app).post("/api/transcribe", json={"audio_b64": AUDIO_B64})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_misconfigured"


def test_intent_bridge_happy_path():
    stt = FakeSpeechToText()
    llm = ScriptedLLM([INTENT_OK])
    response = client_for(llm, stt=stt).post(
        "/api/dialogue/intent-bridge",
        json={"audio_b64": AUDIO_B64, "source_locale": "en-US", "target_locale": "ja-JP", "target_country": "Japan"},
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["raw_transcription"] == stt.text
    assert data["culturally_refined_translation"] == "すみません、駅はどちらでしょうか。"
    assert data["extracted_intent"].startswith("The traveler wants")
    assert data["target_locale"] == "ja-JP"
    assert set(data["timings"]) == {"decode", "transcribe", "muse"}
    assert isinstance(data["latency_ms"], int)
    assert stt.calls[0][1] == "en"
    assert llm.requests[0][0]["role"] == "developer"


def test_intent_bridge_repairs_invalid_model_json_once():
    llm = ScriptedLLM(["Sure! Here you go: not json", INTENT_OK])
    response = client_for(llm).post(
        "/api/dialogue/intent-bridge", json={"audio_b64": AUDIO_B64, "target_locale": "ja-JP"}, headers=AUTH
    )
    assert response.status_code == 200
    assert len(llm.requests) == 2
    assert "did not match the required JSON schema" in llm.requests[1][-1]["content"]


def test_intent_bridge_gives_up_after_second_invalid_reply():
    llm = ScriptedLLM(["nope", '{"extracted_intent": ""}'])
    response = client_for(llm).post(
        "/api/dialogue/intent-bridge", json={"audio_b64": AUDIO_B64, "target_locale": "ja-JP"}, headers=AUTH
    )
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_model_output"
    assert "latency_ms" in response.json()


def test_intent_bridge_rejects_silence():
    response = client_for(ScriptedLLM([]), stt=FakeSpeechToText(text="   ")).post(
        "/api/dialogue/intent-bridge", json={"audio_b64": AUDIO_B64, "target_locale": "fr-FR"}, headers=AUTH
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_speech"


def test_invalid_base64_is_a_bad_payload():
    response = client_for(ScriptedLLM([])).post(
        "/api/transcribe", json={"audio_b64": "this is definitely not base64!!"}, headers=AUTH
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_payload"


def test_request_validation_uses_error_envelope():
    response = client_for(ScriptedLLM([])).post(
        "/api/dialogue/intent-bridge", json={"audio_b64": AUDIO_B64, "target_locale": "not a locale"}, headers=AUTH
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_transcribe_returns_text():
    response = client_for(ScriptedLLM([])).post(
        "/api/transcribe", json={"audio_b64": AUDIO_B64, "language_hint": "sw-KE"}, headers=AUTH
    )
    assert response.status_code == 200
    assert response.json()["text"] == "Excuse me, where is the train station?"


def test_segment_refines_and_caches_image():
    segmenter = FakeSegmenter()
    client = client_for(ScriptedLLM([]), segmenter=segmenter)
    response = client.post("/api/vision/segment", json={"image_b64": make_jpeg_b64(), "scene": "menu"}, headers=AUTH)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["width"] == 640 and data["height"] == 480
    assert data["image_id"].startswith("img_")
    # Overlapping "price" box suppressed by NMS, 2x2 speck dropped.
    assert [s["label"] for s in data["segments"]] == ["menu item", "price"]
    assert segmenter.concepts_seen == [["menu item", "dish photo", "price"]]


def test_isolate_with_cached_image_and_expiry():
    llm = ScriptedLLM(
        [
            json_reply(
                {
                    "detected_object": "Tonkotsu ramen",
                    "contextual_description": "Pork-bone broth noodle soup.",
                    "price_breakdown": "¥980, about 6.50 USD",
                    "safety_precautions": ["Contains pork", "  ", "Contains wheat (gluten)"],
                }
            )
        ]
    )
    client = client_for(llm)
    image_id = client.post("/api/vision/segment", json={"image_b64": make_jpeg_b64()}, headers=AUTH).json()["image_id"]

    response = client.post(
        "/api/vision/sam-isolate",
        json={"image_id": image_id, "click_x": 100, "click_y": 60, "traveler_locale": "en-US", "home_currency": "USD"},
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["detected_object"] == "Tonkotsu ramen"
    assert data["safety_precautions"] == ["Contains pork", "Contains wheat (gluten)"]
    assert data["segment_bbox"] == {"x": 90, "y": 50, "width": 20, "height": 20}
    image_parts = [p for p in llm.requests[0][1]["content"] if p["type"] == "image_url"]
    assert len(image_parts) == 2

    expired = client.post(
        "/api/vision/sam-isolate", json={"image_id": "img_missing", "click_x": 1, "click_y": 1}, headers=AUTH
    )
    assert expired.status_code == 410
    assert expired.json()["error"]["code"] == "expired"


def test_isolate_rejects_out_of_bounds_click_and_ambiguous_source():
    client = client_for(ScriptedLLM([]))
    image = make_jpeg_b64(100, 100)
    outside = client.post("/api/vision/sam-isolate", json={"image_b64": image, "click_x": 500, "click_y": 5}, headers=AUTH)
    assert outside.status_code == 400
    both = client.post(
        "/api/vision/sam-isolate", json={"image_b64": image, "image_id": "img_x", "click_x": 1, "click_y": 1}, headers=AUTH
    )
    assert both.status_code == 422


def test_compile_itinerary_orders_events_and_filters_ids():
    llm = ScriptedLLM(
        [
            json_reply(
                {
                    "summary": "A day of temples and ramen.",
                    "events": [
                        {"timestamp": "2026-10-29T19:00:00+09:00", "activity": "Dinner", "location": "Shinjuku", "source_entry_ids": ["b", "ghost"]},
                        {"timestamp": "2026-10-29T09:30:00+09:00", "activity": "Senso-ji", "location": "Asakusa", "notes": None, "source_entry_ids": ["a"]},
                        {"timestamp": "evening-ish", "activity": "Walk", "location": "Unknown location", "source_entry_ids": []},
                    ],
                }
            )
        ]
    )
    response = client_for(llm).post(
        "/api/logbook/compile-itinerary",
        json={
            "date": "2026-10-29",
            "timezone": "Asia/Tokyo",
            "traveler_locale": "en-US",
            "entries": [
                {"id": "b", "kind": "text", "captured_at": "2026-10-29T10:05:00Z", "text": "ramen tonight!"},
                {"id": "a", "kind": "photo", "captured_at": "2026-10-29T00:31:00Z", "image_b64": make_jpeg_b64(), "latitude": 35.7148, "longitude": 139.7967},
            ],
        },
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    events = response.json()["events"]
    assert [e["activity"] for e in events] == ["Senso-ji", "Dinner", "Walk"]
    assert events[1]["source_entry_ids"] == ["b"]

    content = llm.requests[0][1]["content"]
    assert "UTC offset +09:00" in content[0]["text"]
    assert content[1]["text"].startswith('ENTRY {"id": "a"')
    assert content[2]["type"] == "image_url"


def test_compile_itinerary_rejects_empty_entries():
    response = client_for(ScriptedLLM([])).post(
        "/api/logbook/compile-itinerary",
        json={"date": "2026-10-29", "entries": [{"id": "x", "kind": "text", "captured_at": "2026-10-29T10:00:00Z", "text": "  "}]},
        headers=AUTH,
    )
    assert response.status_code == 422
