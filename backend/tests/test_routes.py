from __future__ import annotations

from fastapi.testclient import TestClient

from songa.gateway import create_app
from tests.fakes import (
    AUDIO_B64,
    AUTH,
    FakePlaces,
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


def test_intent_bridge_uses_speak_reasoning_effort():
    llm = ScriptedLLM([INTENT_OK])
    response = client_for(llm).post(
        "/api/dialogue/intent-bridge", json={"audio_b64": AUDIO_B64, "target_locale": "ja-JP"}, headers=AUTH
    )
    assert response.status_code == 200
    assert llm.efforts == ["minimal"]


def _stream_events(response) -> list[dict]:
    import json

    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def test_intent_bridge_stream_sends_transcript_then_result():
    stt = FakeSpeechToText()
    response = client_for(ScriptedLLM([INTENT_OK]), stt=stt).post(
        "/api/dialogue/intent-bridge/stream",
        json={"audio_b64": AUDIO_B64, "source_locale": "en-US", "target_locale": "ja-JP"},
        headers=AUTH,
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = _stream_events(response)
    assert [event["type"] for event in events] == ["transcript", "result"]
    assert events[0]["text"] == stt.text
    assert set(events[0]["timings"]) == {"decode", "transcribe"}
    result = events[1]
    assert result["culturally_refined_translation"] == "すみません、駅はどちらでしょうか。"
    assert result["raw_transcription"] == stt.text
    assert set(result["timings"]) == {"decode", "transcribe", "muse"}


def test_intent_bridge_stream_reports_model_failure_in_band():
    response = client_for(ScriptedLLM(["nope", "still nope"])).post(
        "/api/dialogue/intent-bridge/stream", json={"audio_b64": AUDIO_B64, "target_locale": "ja-JP"}, headers=AUTH
    )
    assert response.status_code == 200
    events = _stream_events(response)
    assert [event["type"] for event in events] == ["transcript", "error"]
    assert events[1]["status"] == 502
    assert events[1]["error"]["code"] == "invalid_model_output"


def test_intent_bridge_stream_keeps_http_status_for_silence():
    response = client_for(ScriptedLLM([]), stt=FakeSpeechToText(text=" ")).post(
        "/api/dialogue/intent-bridge/stream", json={"audio_b64": AUDIO_B64, "target_locale": "ja-JP"}, headers=AUTH
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_speech"


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


def test_vision_warm_is_protected_and_safe_without_gpu():
    client = client_for(ScriptedLLM([]))
    assert client.post("/api/vision/warm").status_code == 401
    response = client.post("/api/vision/warm", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["warming"] is False


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
                        {"timestamp": "evening-ish", "activity": "Walk", "time_is_estimate": True, "source_entry_ids": []},
                    ],
                    "to_do": ["Book the train to Kyoto", "  "],
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
    assert events[2]["time_is_estimate"] is True and events[2]["location"] == ""
    assert events[0]["time_is_estimate"] is False
    assert response.json()["to_do"] == ["Book the train to Kyoto"]

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


# Look: ask a question about a photo ---------------------------------------------------------------

ASK_OK = json_reply(
    {
        "title": "Kenyatta Conference Centre",
        "answer": "This is almost certainly the KICC, 120 m from you. It opened in 1973.",
        "find": ["tower", "  ", "TOWER", "sign", "door", "extra"],
    }
)


def test_ask_answers_then_highlights_with_location_grounding():
    places = FakePlaces()
    segmenter = FakeSegmenter()
    llm = ScriptedLLM([ASK_OK])
    client = client_for(llm, segmenter=segmenter, places=places)
    image_id = client.post("/api/vision/segment", json={"image_b64": make_jpeg_b64()}, headers=AUTH).json()["image_id"]

    response = client.post(
        "/api/vision/ask",
        json={"image_id": image_id, "question": "Where am I?", "latitude": -1.2889, "longitude": 36.8233},
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    events = _stream_events(response)
    assert [event["type"] for event in events] == ["answer", "highlights"]
    assert events[0]["title"] == "Kenyatta Conference Centre"
    # Blank and duplicate phrases dropped, capped at 3.
    assert events[0]["find"] == ["tower", "sign", "door"]
    assert segmenter.concepts_seen[-1] == ["tower", "sign", "door"]
    assert [s["label"] for s in events[1]["segments"]] == ["menu item", "price"]
    assert all(s["id"].startswith("hl_") for s in events[1]["segments"])

    assert places.calls == [(-1.2889, 36.8233)]
    prompt = llm.requests[0][1]["content"][0]["text"]
    assert "Kenyatta International Convention Centre (120 m)" in prompt
    assert "Question: Where am I?" in prompt
    assert "whole photo" in prompt


def test_ask_about_outlined_item_without_location_skips_places_and_highlights():
    places = FakePlaces()
    segmenter = FakeSegmenter()
    llm = ScriptedLLM([json_reply({"title": "Ramen", "answer": "Pork broth.", "find": []})])
    response = client_for(llm, segmenter=segmenter, places=places).post(
        "/api/vision/ask",
        json={
            "image_b64": make_jpeg_b64(),
            "question": "Is there pork in this?",
            "focus_bbox": {"x": 40, "y": 40, "width": 200, "height": 60},
            "scene": "menu",
        },
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    assert [event["type"] for event in _stream_events(response)] == ["answer"]
    assert places.calls == []
    assert segmenter.concepts_seen == []
    prompt = llm.requests[0][1]["content"][0]["text"]
    assert "outlined item" in prompt
    assert "Approximate location" not in prompt


def test_ask_sends_recent_history_as_a_follow_up():
    llm = ScriptedLLM([json_reply({"title": "Spice", "answer": "Mild.", "find": []})])
    history = [{"question": f"q{i}", "answer": f"a{i}"} for i in range(8)]
    response = client_for(llm).post(
        "/api/vision/ask",
        json={"image_b64": make_jpeg_b64(), "question": "Is it spicy?", "scene": "menu", "history": history},
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    prompt = llm.requests[0][1]["content"][0]["text"]
    assert "Conversation so far about this photo" in prompt
    assert "New question (a follow-up): Is it spicy?" in prompt
    assert "Traveler: q2" in prompt and "You: a7" in prompt  # last 6 kept
    assert "Traveler: q1" not in prompt


def test_location_reaches_menu_prompts_without_landmark_lookup():
    places = FakePlaces()
    reply = json_reply({"detected_object": "Ugali", "contextual_description": "Maize staple.", "safety_precautions": []})
    llm = ScriptedLLM([reply, json_reply({"title": "Ugali", "answer": "Maize.", "find": []})])
    client = client_for(llm, places=places)
    gps = {"latitude": -1.2864, "longitude": 36.8172, "place_label": "Westlands, Nairobi, Kenya"}
    image = make_jpeg_b64()
    tap = client.post(
        "/api/vision/sam-isolate", json={"image_b64": image, "click_x": 100, "click_y": 60, "scene": "menu", **gps}, headers=AUTH
    )
    assert tap.status_code == 200, tap.text
    asked = client.post(
        "/api/vision/ask", json={"image_b64": image, "question": "Is this spicy?", "scene": "menu", **gps}, headers=AUTH
    )
    assert asked.status_code == 200, asked.text
    for request in llm.requests:
        assert "currently in Westlands, Nairobi, Kenya (GPS -1.286, 36.817)" in request[1]["content"][0]["text"]
    assert places.calls == []  # a food question on a menu does not need landmarks

    llm.replies.append(json_reply({"title": "Area", "answer": "Westlands.", "find": []}))
    client.post("/api/vision/ask", json={"image_b64": image, "question": "What area is this?", "scene": "menu", **gps}, headers=AUTH)
    assert places.calls == [(-1.2864, 36.8172)]


def test_ask_validates_inputs_and_expiry():
    client = client_for(ScriptedLLM([]))
    image = make_jpeg_b64(100, 100)
    expired = client.post("/api/vision/ask", json={"image_id": "img_missing", "question": "What is this?"}, headers=AUTH)
    assert expired.status_code == 410
    blank = client.post("/api/vision/ask", json={"image_b64": image, "question": "   "}, headers=AUTH)
    assert blank.status_code == 422
    half_gps = client.post("/api/vision/ask", json={"image_b64": image, "question": "Where?", "latitude": 1.0}, headers=AUTH)
    assert half_gps.status_code == 422
    off_image = client.post(
        "/api/vision/ask",
        json={"image_b64": image, "question": "What?", "focus_bbox": {"x": 500, "y": 500, "width": 10, "height": 10}},
        headers=AUTH,
    )
    assert off_image.status_code == 400


# Anchor: show-a-local cards -----------------------------------------------------------------------

CARD_OK = json_reply(
    {
        "title_local": "ホテル桜",
        "title_meaning": "Hotel Sakura",
        "body_local": "東京都台東区浅草1-2-3。ここまでお願いします。",
        "body_meaning": "1-2-3 Asakusa, Taito, Tokyo. Please take me here.",
        "phrases": [{"local": "ここに行ってください", "meaning": "Please take me here"}, {"local": " ", "meaning": "x"}],
    }
)


def test_home_card_sends_address_and_drops_blank_phrases():
    llm = ScriptedLLM([CARD_OK])
    response = client_for(llm).post(
        "/api/cards/local",
        json={
            "kind": "home",
            "target_locale": "ja-JP",
            "target_country": "Japan",
            "place_name": "Hotel Sakura",
            "address": "1-2-3 Asakusa, Taito, Tokyo",
            "latitude": 35.7148,
            "longitude": 139.7967,
        },
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["kind"] == "home" and data["target_locale"] == "ja-JP"
    assert data["title_local"] == "ホテル桜"
    assert data["phrases"] == [{"local": "ここに行ってください", "meaning": "Please take me here"}]
    sent = llm.requests[0][1]["content"]
    assert '"address": "1-2-3 Asakusa, Taito, Tokyo"' in sent
    assert '"coordinates": [35.7148, 139.7967]' in sent
    assert "allergies" not in sent


def test_needs_card_requires_content():
    client = client_for(ScriptedLLM([]))
    empty = client.post("/api/cards/local", json={"kind": "needs", "target_locale": "ja-JP"}, headers=AUTH)
    assert empty.status_code == 422
    no_place = client.post("/api/cards/local", json={"kind": "home", "target_locale": "ja-JP"}, headers=AUTH)
    assert no_place.status_code == 422


def test_needs_card_sends_only_needs():
    llm = ScriptedLLM([CARD_OK])
    response = client_for(llm).post(
        "/api/cards/local",
        json={"kind": "needs", "target_locale": "th-TH", "allergies": ["Peanuts"], "diet": ["Halal"], "place_name": "x"},
        headers=AUTH,
    )
    assert response.status_code == 200, response.text
    sent = llm.requests[0][1]["content"]
    assert '"allergies": ["Peanuts"]' in sent and '"diet": ["Halal"]' in sent
    assert "place_name" not in sent


def test_traveler_needs_reach_both_look_prompts():
    reply = json_reply({"detected_object": "Pad thai", "contextual_description": "Noodles.", "safety_precautions": []})
    llm = ScriptedLLM([reply, json_reply({"title": "Pad thai", "answer": "Noodles.", "find": []})])
    client = client_for(llm)
    image = make_jpeg_b64()
    needs = "Allergies: peanuts. Diet: halal."
    isolate = client.post(
        "/api/vision/sam-isolate",
        json={"image_b64": image, "click_x": 100, "click_y": 60, "traveler_needs": needs},
        headers=AUTH,
    )
    assert isolate.status_code == 200, isolate.text
    asked = client.post("/api/vision/ask", json={"image_b64": image, "question": "Is this safe?", "traveler_needs": needs}, headers=AUTH)
    assert asked.status_code == 200, asked.text
    assert needs in llm.requests[0][1]["content"][0]["text"]
    assert needs in llm.requests[1][1]["content"][0]["text"]
    assert '"For you:"' in llm.requests[1][1]["content"][0]["text"]
