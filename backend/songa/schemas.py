"""HTTP contracts. Mirrored on the client in `mobile/src/services/api/schemas.ts`."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SceneMode = Literal["menu", "signage", "market", "general"]
LOCALE_PATTERN = r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TimedResponse(BaseModel):
    latency_ms: int
    timings: dict[str, int] = Field(default_factory=dict)


class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


# Dialogue -----------------------------------------------------------------------------------------


class IntentBridgeRequest(StrictModel):
    audio_b64: str = Field(min_length=16)
    audio_mime: str = Field(default="audio/mp4", max_length=64)
    source_locale: str | None = Field(default=None, pattern=LOCALE_PATTERN)
    target_locale: str = Field(pattern=LOCALE_PATTERN)
    target_country: str | None = Field(default=None, max_length=64)


class IntentBridgeResponse(TimedResponse):
    raw_transcription: str
    detected_language: str | None
    extracted_intent: str
    culturally_refined_translation: str
    politeness_notes: str | None = None
    target_locale: str


class TranscribeRequest(StrictModel):
    audio_b64: str = Field(min_length=16)
    audio_mime: str = Field(default="audio/mp4", max_length=64)
    language_hint: str | None = Field(default=None, pattern=LOCALE_PATTERN)


class TranscribeResponse(TimedResponse):
    text: str
    detected_language: str | None


# Vision -------------------------------------------------------------------------------------------


class SegmentRequest(StrictModel):
    image_b64: str = Field(min_length=16)
    scene: SceneMode = "general"


class Segment(BaseModel):
    id: str
    label: str
    score: float
    bbox: BoundingBox


class SegmentResponse(TimedResponse):
    image_id: str
    width: int
    height: int
    segments: list[Segment]


class IsolateRequest(StrictModel):
    image_id: str | None = Field(default=None, max_length=64)
    image_b64: str | None = None
    click_x: int = Field(ge=0)
    click_y: int = Field(ge=0)
    traveler_locale: str = Field(default="en-US", pattern=LOCALE_PATTERN)
    home_currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    scene: SceneMode = "general"
    traveler_needs: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _one_image_source(self) -> IsolateRequest:
        if bool(self.image_id) == bool(self.image_b64):
            raise ValueError("Provide exactly one of image_id or image_b64.")
        return self


class AskRequest(StrictModel):
    """A free-form question about a photo, optionally about one outlined item and grounded by GPS."""

    image_id: str | None = Field(default=None, max_length=64)
    image_b64: str | None = None
    question: str = Field(min_length=1, max_length=300)
    focus_bbox: BoundingBox | None = None
    traveler_locale: str = Field(default="en-US", pattern=LOCALE_PATTERN)
    home_currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    scene: SceneMode = "general"
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    traveler_needs: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _valid_sources(self) -> AskRequest:
        if bool(self.image_id) == bool(self.image_b64):
            raise ValueError("Provide exactly one of image_id or image_b64.")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both latitude and longitude, or neither.")
        if not self.question.strip():
            raise ValueError("The question is empty.")
        return self


class IsolateResponse(TimedResponse):
    detected_object: str
    contextual_description: str
    price_breakdown: str | None
    safety_precautions: list[str]
    segment_bbox: BoundingBox


# Logbook ------------------------------------------------------------------------------------------


class LogbookEntry(StrictModel):
    id: str = Field(min_length=1, max_length=64)
    kind: Literal["text", "voice", "photo"]
    captured_at: str = Field(max_length=40)
    text: str | None = Field(default=None, max_length=4000)
    image_b64: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def _has_content(self) -> LogbookEntry:
        if not (self.text and self.text.strip()) and not self.image_b64:
            raise ValueError(f"Entry {self.id} has neither text nor an image.")
        return self


class CompileItineraryRequest(StrictModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    timezone: str = Field(default="UTC", max_length=64)
    traveler_locale: str = Field(default="en-US", pattern=LOCALE_PATTERN)
    entries: list[LogbookEntry] = Field(min_length=1)


class ItineraryEvent(BaseModel):
    timestamp: str
    time_is_estimate: bool = False
    activity: str
    location: str = ""
    notes: str | None = None
    source_entry_ids: list[str] = Field(default_factory=list)


class CompileItineraryResponse(TimedResponse):
    summary: str
    events: list[ItineraryEvent]
    to_do: list[str] = Field(default_factory=list)


# Show-a-local cards (Anchor) ----------------------------------------------------------------------

CardKind = Literal["home", "needs"]
ShortItem = Annotated[str, Field(min_length=1, max_length=40)]


class LocalCardRequest(StrictModel):
    """Inputs for a card the traveler shows to a local: the way home, or their dietary and medical needs."""

    kind: CardKind
    target_locale: str = Field(pattern=LOCALE_PATTERN)
    target_country: str | None = Field(default=None, max_length=64)
    traveler_locale: str = Field(default="en-US", pattern=LOCALE_PATTERN)
    # home
    place_name: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    # needs
    allergies: list[ShortItem] = Field(default_factory=list, max_length=20)
    diet: list[ShortItem] = Field(default_factory=list, max_length=20)
    notes: str | None = Field(default=None, max_length=400)

    @model_validator(mode="after")
    def _has_content(self) -> LocalCardRequest:
        if self.kind == "home" and not (
            (self.place_name and self.place_name.strip()) or (self.address and self.address.strip()) or self.latitude is not None
        ):
            raise ValueError("A home card needs a place name, an address or coordinates.")
        if self.kind == "needs" and not (self.allergies or self.diet or (self.notes and self.notes.strip())):
            raise ValueError("A needs card needs at least one allergy, diet or note.")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both latitude and longitude, or neither.")
        return self


class CardPhrase(BaseModel):
    local: str = Field(min_length=1)
    meaning: str = Field(min_length=1)


class LocalCardResponse(TimedResponse):
    kind: CardKind
    target_locale: str
    title_local: str
    title_meaning: str
    body_local: str
    body_meaning: str
    phrases: list[CardPhrase]


# Model output contracts (what Muse Wonder must return) --------------------------------------------


class LocalCardModelOutput(BaseModel):
    title_local: str = Field(min_length=1)
    title_meaning: str = Field(min_length=1)
    body_local: str = Field(min_length=1)
    body_meaning: str = Field(min_length=1)
    phrases: list[CardPhrase] = Field(default_factory=list)


class IntentModelOutput(BaseModel):
    extracted_intent: str = Field(min_length=1)
    culturally_refined_translation: str = Field(min_length=1)
    politeness_notes: str | None = None


class VisionModelOutput(BaseModel):
    detected_object: str = Field(min_length=1)
    contextual_description: str = Field(min_length=1)
    price_breakdown: str | None = None
    safety_precautions: list[str] = Field(default_factory=list)


class AskModelOutput(BaseModel):
    title: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    find: list[str] = Field(default_factory=list)


class ItineraryModelOutput(BaseModel):
    summary: str
    events: list[ItineraryEvent]
    to_do: list[str] = Field(default_factory=list)
