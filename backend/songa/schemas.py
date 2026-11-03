"""HTTP contracts. Mirrored on the client in `mobile/src/services/api/schemas.ts`."""

from __future__ import annotations

from typing import Literal

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

    @model_validator(mode="after")
    def _one_image_source(self) -> IsolateRequest:
        if bool(self.image_id) == bool(self.image_b64):
            raise ValueError("Provide exactly one of image_id or image_b64.")
        return self


class IsolateResponse(TimedResponse):
    detected_object: str
    contextual_description: str
    price_breakdown: str | None
    safety_precautions: list[str]
    segment_bbox: BoundingBox


Verdict = Literal["safe", "ask", "avoid"]


class MenuMark(StrictModel):
    id: str = Field(min_length=1, max_length=64)
    bbox: BoundingBox


class MenuCheckRequest(StrictModel):
    image_id: str | None = Field(default=None, max_length=64)
    image_b64: str | None = None
    marks: list[MenuMark] = Field(default_factory=list, max_length=40)
    needs: str = Field(min_length=2, max_length=400)
    traveler_locale: str = Field(default="en-US", pattern=LOCALE_PATTERN)
    local_locale: str | None = Field(default=None, pattern=LOCALE_PATTERN)

    @model_validator(mode="after")
    def _one_image_source(self) -> MenuCheckRequest:
        if bool(self.image_id) == bool(self.image_b64):
            raise ValueError("Provide exactly one of image_id or image_b64.")
        return self


class MenuDish(BaseModel):
    name: str
    verdict: Verdict
    reason: str
    segment_id: str | None = None
    bbox: BoundingBox | None = None


class MenuCheckResponse(TimedResponse):
    spoken_summary: str
    staff_question: str | None
    staff_question_meaning: str | None
    dishes: list[MenuDish]


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
    activity: str
    location: str
    notes: str | None = None
    source_entry_ids: list[str] = Field(default_factory=list)


class CompileItineraryResponse(TimedResponse):
    summary: str
    events: list[ItineraryEvent]


# Trip ---------------------------------------------------------------------------------------------


class TripBriefingRequest(StrictModel):
    destination: str = Field(min_length=2, max_length=120)
    start_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    days: int = Field(ge=1, le=14)
    stay: str | None = Field(default=None, max_length=160)
    needs: str | None = Field(default=None, max_length=400)
    traveler_locale: str = Field(default="en-US", pattern=LOCALE_PATTERN)
    destination_locale: str = Field(pattern=LOCALE_PATTERN)
    home_currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")


class TripDay(BaseModel):
    date: str
    title: str
    suggestions: list[str] = Field(default_factory=list)


class TripPhrase(BaseModel):
    meaning: str
    phrase: str
    pronunciation: str | None = None


class EmergencyNumber(BaseModel):
    label: str
    number: str


class TripBriefingResponse(TimedResponse):
    destination: str
    destination_locale: str
    summary: str
    days: list[TripDay]
    phrases: list[TripPhrase]
    etiquette: list[str]
    safety: list[str]
    money: list[str]
    getting_around: list[str]
    emergency_numbers: list[EmergencyNumber]


# Model output contracts (what Muse Wonder must return) --------------------------------------------


class IntentModelOutput(BaseModel):
    extracted_intent: str = Field(min_length=1)
    culturally_refined_translation: str = Field(min_length=1)
    politeness_notes: str | None = None


class VisionModelOutput(BaseModel):
    detected_object: str = Field(min_length=1)
    contextual_description: str = Field(min_length=1)
    price_breakdown: str | None = None
    safety_precautions: list[str] = Field(default_factory=list)


class MenuDishModelOutput(BaseModel):
    mark: int | None = None
    name: str = Field(min_length=1)
    verdict: Verdict
    reason: str = Field(min_length=1)


class MenuCheckModelOutput(BaseModel):
    spoken_summary: str = Field(min_length=1)
    staff_question: str | None = None
    staff_question_meaning: str | None = None
    dishes: list[MenuDishModelOutput] = Field(default_factory=list)


class ItineraryModelOutput(BaseModel):
    summary: str
    events: list[ItineraryEvent]


class TripBriefingModelOutput(BaseModel):
    summary: str = Field(min_length=1)
    days: list[TripDay] = Field(default_factory=list)
    phrases: list[TripPhrase] = Field(default_factory=list)
    etiquette: list[str] = Field(default_factory=list)
    safety: list[str] = Field(default_factory=list)
    money: list[str] = Field(default_factory=list)
    getting_around: list[str] = Field(default_factory=list)
    emergency_numbers: list[EmergencyNumber] = Field(default_factory=list)
