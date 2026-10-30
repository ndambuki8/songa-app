from __future__ import annotations

import asyncio
import io
import json
import shutil
import wave

import httpx
import pytest
from meta_sam_parser._mask_codec import _encode_raster
from PIL import Image

from songa.core.errors import ServiceMisconfigured, UnprocessableMedia, UpstreamUnavailable
from songa.services.meta_api import MetaApiClient
from songa.services.meta_sam import MetaSamSegmenter, point_prompt, response_output_text
from songa.services.meta_transcriber import MetaVoiceTranscriber, convert_to_wav, language_bias


def run(coro):
    return asyncio.run(coro)


def make_client(handler) -> MetaApiClient:
    return MetaApiClient(
        api_key="meta-key", base_url="https://api.meta.ai/v1", timeout_s=5, http=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )


def jpeg(width: int = 100, height: int = 80) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (240, 240, 240)).save(buffer, format="JPEG")
    return buffer.getvalue()


def sam_record(object_id: str, x1: int, y1: int, x2: int, y2: int, confidence: float, *, w: int = 100, h: int = 80) -> str:
    mask_w, mask_h = x2 - x1 + 1, y2 - y1 + 1
    payload = _encode_raster([1] * (mask_w * mask_h), mask_w, mask_h)
    return (
        f"{object_id}<|box;x1={x1};y1={y1};x2={x2};y2={y2};w={w};h={h};c={confidence}|>"
        f"<|mask;x=0;y=0;c={confidence};data={mask_h},{mask_w},{payload}|>"
    )


def responses_body(text: str) -> dict:
    return {
        "id": "resp_1",
        "status": "completed",
        "output": [{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": text}]}],
    }


# SAM 3.1 -------------------------------------------------------------------------------------------


def test_segment_sends_one_request_per_concept_and_filters_low_confidence():
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append(body)
        concept = body["input"][0]["content"][0]["text"]
        text = "<0f>" + sam_record("1", 10, 20, 39, 49, 0.91) if concept == "sign" else "<0f>" + sam_record("1", 0, 0, 9, 9, 0.1)
        return httpx.Response(200, json=responses_body(text))

    segmenter = MetaSamSegmenter(make_client(handler), model="sam-3.1", score_threshold=0.35)
    segments = run(segmenter.segment(jpeg(), ["sign", "price"]))

    assert [(s.label, s.x, s.y, s.width, s.height) for s in segments] == [("sign", 10, 20, 30, 30)]
    assert segments[0].score == pytest.approx(0.91)
    assert {r["input"][0]["content"][0]["text"] for r in requests} == {"sign", "price"}
    first = requests[0]
    assert first["model"] == "sam-3.1"
    assert first["metadata"] == {"include_confidence": "true", "mask_encoding": "one_bit"}
    assert first["input"][0]["content"][1]["image_url"].startswith("data:image/jpeg;base64,")


def test_segment_with_no_matches_returns_empty():
    client = make_client(lambda request: httpx.Response(200, json=responses_body("")))
    assert run(MetaSamSegmenter(client, model="sam-3.1", score_threshold=0.3).segment(jpeg(), ["menu item"])) == []


def test_isolate_sends_point_prompt_and_builds_crops():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content)["input"][0]["content"][0]["text"])
        return httpx.Response(200, json=responses_body("<0f>" + sam_record("1", 30, 20, 69, 59, 0.8)))

    isolation = run(MetaSamSegmenter(make_client(handler), model="sam-3.1", score_threshold=0.3).isolate(jpeg(), 50, 40))

    assert seen == [point_prompt(50, 40, 100, 80)] == ["<0f>1<|point;x=50;y=40;w=100;h=80|>"]
    assert (isolation.x, isolation.y, isolation.width, isolation.height) == (30, 20, 40, 40)
    assert isolation.mask_score == pytest.approx(0.8)
    assert isolation.crop_jpeg[:2] == b"\xff\xd8" and isolation.context_jpeg[:2] == b"\xff\xd8"


def test_isolate_without_mask_is_unprocessable():
    client = make_client(lambda request: httpx.Response(200, json=responses_body("")))
    with pytest.raises(UnprocessableMedia):
        run(MetaSamSegmenter(client, model="sam-3.1", score_threshold=0.3).isolate(jpeg(), 5, 5))


def test_response_output_text_prefers_convenience_field():
    assert response_output_text({"output_text": "abc", "output": []}) == "abc"
    assert response_output_text(responses_body("xyz")) == "xyz"


@pytest.mark.parametrize(
    ("status", "error"),
    [(401, ServiceMisconfigured), (404, ServiceMisconfigured), (429, UpstreamUnavailable), (400, UnprocessableMedia)],
)
def test_sam_http_errors_map_to_songa_errors(status, error):
    client = make_client(lambda request: httpx.Response(status, json={"error": {"message": "nope"}}))
    with pytest.raises(error):
        run(MetaSamSegmenter(client, model="sam-3.1", score_threshold=0.3).segment(jpeg(), ["sign"]))


def test_missing_meta_key_is_a_configuration_error():
    client = MetaApiClient(api_key="", base_url="https://api.meta.ai/v1", timeout_s=5)
    with pytest.raises(ServiceMisconfigured):
        run(MetaSamSegmenter(client, model="sam-3.1", score_threshold=0.3).segment(jpeg(), ["sign"]))


# Muse Voice Transcribe ------------------------------------------------------------------------------


async def passthrough(audio: bytes) -> bytes:
    return b"RIFF" + audio


def test_transcribe_posts_multipart_request_with_language_bias():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers["authorization"]
        captured["body"] = request.content
        return httpx.Response(200, json={"sessionId": "s1", "transcript": "  Where is the station?  ", "turns": []})

    stt = MetaVoiceTranscriber(make_client(handler), model="muse-voice-transcribe-1.0", to_wav=passthrough)
    transcript = run(stt.transcribe(b"audio", "ja"))

    assert transcript.text == "Where is the station?"
    assert transcript.language is None
    assert captured["url"] == "https://api.meta.ai/v1/asr/transcribe"
    assert captured["auth"] == "Bearer meta-key"
    body = captured["body"]
    assert b'name="audio"; filename="speech.wav"' in body and b"RIFFaudio" in body
    request_json = body.split(b'name="request"', 1)[1].split(b"\r\n\r\n", 1)[1].split(b"\r\n--", 1)[0]
    assert json.loads(request_json) == {
        "model": "muse-voice-transcribe-1.0",
        "mode": "PUSH_TO_TALK",
        "audioEncoding": "WAV",
        "languageBias": ["Japanese"],
    }


def test_unsupported_language_hint_is_not_sent_as_bias():
    assert language_bias("sw") == []
    assert language_bias("zh") == ["Mandarin Chinese"]
    assert language_bias(None) == []


def test_transcribe_bad_audio_is_unprocessable():
    client = make_client(lambda request: httpx.Response(400, json={"error": {"message": "not a WAV"}}))
    with pytest.raises(UnprocessableMedia):
        run(MetaVoiceTranscriber(client, model="m", to_wav=passthrough).transcribe(b"x", None))


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_convert_to_wav_produces_mono_24khz_pcm():
    source = io.BytesIO()
    with wave.open(source, "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(44_100)
        wav.writeframes(b"\x01\x00\x02\x00" * 4410)

    with wave.open(io.BytesIO(run(convert_to_wav(source.getvalue()))), "rb") as converted:
        assert (converted.getnchannels(), converted.getsampwidth(), converted.getframerate()) == (1, 2, 24_000)
        assert converted.getnframes() == pytest.approx(2400, abs=50)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_convert_to_wav_rejects_garbage():
    with pytest.raises(UnprocessableMedia):
        run(convert_to_wav(b"definitely not audio"))
