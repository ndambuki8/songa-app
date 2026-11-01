"""Interfaces between HTTP routes and the inference backends.

Routes depend only on these protocols. `modal_app.py` binds them to the Meta Model API; tests bind
them to in-process fakes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class Transcript:
    text: str
    language: str | None


@dataclass(frozen=True)
class RawSegment:
    label: str
    score: float
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class Isolation:
    x: int
    y: int
    width: int
    height: int
    mask_score: float
    crop_jpeg: bytes
    context_jpeg: bytes


class SpeechToText(Protocol):
    async def transcribe(self, audio: bytes, language_hint: str | None) -> Transcript: ...


class Segmenter(Protocol):
    async def segment(self, image: bytes, concepts: list[str]) -> list[RawSegment]: ...

    async def isolate(self, image: bytes, x: int, y: int) -> Isolation: ...


class ImageStore(Protocol):
    async def put(self, image: bytes) -> str: ...

    async def get(self, image_id: str) -> bytes | None: ...


@dataclass(frozen=True)
class NearbyPlace:
    name: str
    distance_m: int


class PlaceLookup(Protocol):
    async def nearby(self, latitude: float, longitude: float) -> list[NearbyPlace]:
        """Notable places around a point, nearest first. Returns [] on any failure; never raises."""
        ...


ChatMessage = dict[str, Any]


class LanguageModel(Protocol):
    async def complete(
        self, messages: list[ChatMessage], *, max_tokens: int, reasoning_effort: str | None = None
    ) -> str:
        """`reasoning_effort` overrides the client's default for this call; None keeps the default."""
        ...


@dataclass(frozen=True)
class Engines:
    stt: SpeechToText
    segmenter: Segmenter
    images: ImageStore
    llm: LanguageModel
    places: PlaceLookup | None = None
