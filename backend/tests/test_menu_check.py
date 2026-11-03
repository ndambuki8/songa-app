from __future__ import annotations

import io
import json

from fastapi.testclient import TestClient
from PIL import Image

from songa.gateway import create_app
from songa.vision.geometry import Box, render_numbered_marks
from tests.fakes import AUTH, ScriptedLLM, build_engines, json_reply, make_jpeg_b64, make_settings

CHECK = {
    "spoken_summary": "Avoid the satay, it has peanut sauce. Two dishes look safe.",
    "staff_question": "ピーナッツアレルギーがあります。この料理にピーナッツは入っていますか？",
    "staff_question_meaning": "I have a peanut allergy. Does this dish contain peanuts?",
    "dishes": [
        {"mark": 2, "name": "Gohan (steamed rice)", "verdict": "safe", "reason": "Plain rice."},
        {"mark": 9, "name": "Pad thai", "verdict": "ask", "reason": "Often topped with peanuts."},
        {"mark": 1, "name": "Satay", "verdict": "avoid", "reason": "Served with peanut sauce."},
        {"mark": None, "name": "Green tea", "verdict": "safe", "reason": "No allergens."},
    ],
}

MARKS = [
    {"id": "seg_0", "bbox": {"x": 10, "y": 10, "width": 100, "height": 40}},
    {"id": "seg_1", "bbox": {"x": 10, "y": 80, "width": 100, "height": 40}},
]


def client_for(llm: ScriptedLLM) -> TestClient:
    return TestClient(create_app(make_settings(), build_engines(llm)), raise_server_exceptions=False)


def request(**overrides) -> dict:
    return {
        "image_b64": make_jpeg_b64(),
        "marks": MARKS,
        "needs": "severe peanut allergy",
        "traveler_locale": "en-US",
        "local_locale": "ja-JP",
        **overrides,
    }


def test_menu_check_maps_marks_and_sorts_by_risk():
    llm = ScriptedLLM([json_reply(CHECK)])
    response = client_for(llm).post("/api/vision/menu-check", json=request(), headers=AUTH)
    assert response.status_code == 200, response.text
    dishes = response.json()["dishes"]

    assert [d["verdict"] for d in dishes] == ["avoid", "ask", "safe", "safe"]
    assert dishes[0]["segment_id"] == "seg_0"
    assert dishes[0]["bbox"]["y"] == 10
    assert dishes[1]["segment_id"] is None
    assert dishes[2]["segment_id"] == "seg_1"
    assert response.json()["staff_question"].startswith("ピーナッツ")

    content = llm.requests[0][1]["content"]
    sent = json.loads(content[0]["text"])
    assert sent["traveler_needs"] == "severe peanut allergy"
    assert sent["outlined_items"] == 2
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_menu_check_repairs_an_unknown_verdict_once():
    bad = json_reply({**CHECK, "dishes": [{"mark": 1, "name": "Satay", "verdict": "maybe", "reason": "?"}]})
    llm = ScriptedLLM([bad, json_reply(CHECK)])
    response = client_for(llm).post("/api/vision/menu-check", json=request(), headers=AUTH)
    assert response.status_code == 200
    assert len(llm.requests) == 2


def test_menu_check_reports_expired_photo_session():
    response = client_for(ScriptedLLM([])).post(
        "/api/vision/menu-check", json=request(image_b64=None, image_id="img_missing"), headers=AUTH
    )
    assert response.status_code == 410
    assert response.json()["error"]["code"] == "expired"


def test_menu_check_requires_needs():
    response = client_for(ScriptedLLM([])).post("/api/vision/menu-check", json=request(needs=""), headers=AUTH)
    assert response.status_code == 422


def test_render_numbered_marks_keeps_aspect_and_downscales():
    image = Image.new("RGB", (3000, 1500), (240, 240, 240))
    jpeg = render_numbered_marks(image, [Box(100, 100, 400, 200), Box(0, 0, 50, 50)])
    rendered = Image.open(io.BytesIO(jpeg))
    assert rendered.size == (1536, 768)
    assert rendered.getpixel((60, 60)) != (240, 240, 240)
