from __future__ import annotations

import base64
import io
import json
from collections.abc import Callable
from dataclasses import dataclass, field

from PIL import Image

from songa.config import Settings
from songa.engines import ChatMessage, Engines, Isolation, RawSegment, Transcript
from songa.stores import InMemoryImageStore

API_KEY = "test-key"
AUTH = {"Authorization": f"Bearer {API_KEY}"}


def make_jpeg_b64(width: int = 640, height: int = 480) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (200, 180, 120)).save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode()


AUDIO_B64 = base64.b64encode(b"\x00\x01fake-m4a-bytes" * 8).decode()


@dataclass
class FakeSpeechToText:
    text: str = "Excuse me, where is the train station?"
    language: str | None = "en"
    calls: list[tuple[int, str | None]] = field(default_factory=list)

    async def transcribe(self, audio: bytes, language_hint: str | None) -> Transcript:
        self.calls.append((len(audio), language_hint))
        return Transcript(text=self.text, language=self.language)


@dataclass
class FakeSegmenter:
    segments: list[RawSegment] = field(
        default_factory=lambda: [
            RawSegment(label="menu item", score=0.92, x=40, y=40, width=200, height=60),
            RawSegment(label="price", score=0.88, x=45, y=42, width=195, height=58),
            RawSegment(label="price", score=0.81, x=400, y=300, width=80, height=40),
            RawSegment(label="text", score=0.5, x=0, y=0, width=2, height=2),
        ]
    )
    concepts_seen: list[list[str]] = field(default_factory=list)

    async def segment(self, image: bytes, concepts: list[str]) -> list[RawSegment]:
        self.concepts_seen.append(concepts)
        return list(self.segments)

    async def isolate(self, image: bytes, x: int, y: int) -> Isolation:
        return Isolation(x=x - 10, y=y - 10, width=20, height=20, mask_score=0.9, crop_jpeg=b"crop", context_jpeg=b"ctx")


@dataclass
class ScriptedLLM:
    """Returns queued replies in order; a callable reply receives the messages."""

    replies: list[str | Callable[[list[ChatMessage]], str]]
    requests: list[list[ChatMessage]] = field(default_factory=list)

    async def complete(self, messages: list[ChatMessage], *, max_tokens: int) -> str:
        self.requests.append(messages)
        reply = self.replies.pop(0)
        return reply(messages) if callable(reply) else reply


def json_reply(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)


def build_engines(llm: ScriptedLLM, *, stt: FakeSpeechToText | None = None, segmenter: FakeSegmenter | None = None) -> Engines:
    return Engines(
        stt=stt or FakeSpeechToText(),
        segmenter=segmenter or FakeSegmenter(),
        images=InMemoryImageStore(ttl_s=60),
        llm=llm,
    )


def make_settings(**overrides) -> Settings:
    return Settings(api_key=API_KEY, **overrides)
