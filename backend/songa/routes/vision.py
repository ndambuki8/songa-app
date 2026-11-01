from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from songa.config import Settings
from songa.core.errors import BadPayload, ResourceExpired
from songa.core.media import decode_base64_payload, downscale, encode_jpeg, open_rgb_image, to_data_url
from songa.core.ndjson import NDJSON_HEADERS, NDJSON_MEDIA_TYPE, ndjson_line
from songa.core.telemetry import StageTimer, request_timer
from songa.engines import Engines, NearbyPlace
from songa.llm.prompts import VISION_ANALYSIS_SYSTEM, VISION_ASK_SYSTEM, vision_analysis_user, vision_ask_user
from songa.llm.structured import complete_structured
from songa.routes.deps import get_engines, get_settings
from songa.schemas import (
    AskModelOutput,
    AskRequest,
    BoundingBox,
    IsolateRequest,
    IsolateResponse,
    Segment,
    SegmentRequest,
    SegmentResponse,
    VisionModelOutput,
)
from songa.vision.geometry import SCENE_CONCEPTS, Box, refine_segments, render_context

logger = logging.getLogger(__name__)
router = APIRouter()


def _note_sam_backend(timer: StageTimer, engines: Engines) -> None:
    """Renames the `sam` timing to `sam_gpu` or `sam_fallback` when a self-hosted GPU segmenter is in use."""
    served = getattr(engines.segmenter, "last_served_by", None)
    if served and "sam" in timer.stages:
        timer.stages[f"sam_{served}"] = timer.stages.pop("sam")

ASK_IMAGE_MAX_EDGE = 1536
#: Earlier exchanges sent to the model; older ones are dropped to keep prompts short and fast.
MAX_HISTORY_TURNS = 6
MAX_FIND_CONCEPTS = 3
MAX_POINTS = 6
MAX_ALERTS = 3
MAX_HIGHLIGHTS = 12
MAX_NEARBY_PLACES = 10


def _segments(raw, *, width: int, height: int, prefix: str, max_count: int = 40) -> list[Segment]:
    refined = refine_segments(raw, image_w=width, image_h=height, max_count=max_count)
    return [
        Segment(
            id=f"{prefix}_{index}",
            label=item.label,
            score=round(item.score, 4),
            bbox=BoundingBox(x=item.x, y=item.y, width=item.width, height=item.height),
        )
        for index, item in enumerate(refined)
    ]


async def _load_image(image_id: str | None, image_b64: str | None, engines: Engines, settings: Settings) -> bytes:
    if image_id:
        image_bytes = await engines.images.get(image_id)
        if image_bytes is None:
            raise ResourceExpired("The photo session expired. Resend the image.")
        return image_bytes
    return decode_base64_payload(image_b64 or "", max_bytes=settings.max_image_bytes, label="image")


@router.post("/api/vision/segment", response_model=SegmentResponse)
async def segment(
    body: SegmentRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> SegmentResponse:
    with timer.stage("decode"):
        image_bytes = decode_base64_payload(body.image_b64, max_bytes=settings.max_image_bytes, label="image")
        width, height = open_rgb_image(image_bytes).size

    with timer.stage("sam"):
        raw = await engines.segmenter.segment(image_bytes, SCENE_CONCEPTS[body.scene])
    _note_sam_backend(timer, engines)

    with timer.stage("cache"):
        image_id = await engines.images.put(image_bytes)

    return SegmentResponse(
        image_id=image_id,
        width=width,
        height=height,
        segments=_segments(raw, width=width, height=height, prefix="seg"),
        **timer.report(),
    )


@router.post("/api/vision/warm")
async def warm(engines: Engines = Depends(get_engines), timer: StageTimer = Depends(request_timer)) -> dict[str, object]:
    """Called when the Look tab opens, so a self-hosted SAM GPU boots while the traveler frames a photo."""
    warmer = getattr(engines.segmenter, "warm", None)
    if warmer is not None:
        await warmer()
    return {"status": "ok", "warming": warmer is not None, **timer.report()}


@router.post("/api/vision/sam-isolate", response_model=IsolateResponse)
async def sam_isolate(
    body: IsolateRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> IsolateResponse:
    with timer.stage("load_image"):
        image_bytes = await _load_image(body.image_id, body.image_b64, engines, settings)
        width, height = open_rgb_image(image_bytes).size

    if body.click_x >= width or body.click_y >= height:
        raise BadPayload(f"Click ({body.click_x}, {body.click_y}) is outside the {width}x{height} image.")

    with timer.stage("sam"):
        isolation = await engines.segmenter.isolate(image_bytes, body.click_x, body.click_y)
    _note_sam_backend(timer, engines)

    with timer.stage("muse"):
        output = await complete_structured(
            engines.llm,
            system_prompt=VISION_ANALYSIS_SYSTEM,
            user_content=vision_analysis_user(
                scene=body.scene,
                traveler_locale=body.traveler_locale,
                home_currency=body.home_currency,
                crop_url=to_data_url(isolation.crop_jpeg),
                context_url=to_data_url(isolation.context_jpeg),
                traveler_needs=body.traveler_needs,
                place_label=body.place_label,
                coordinates=_coordinates(body.latitude, body.longitude),
            ),
            output_model=VisionModelOutput,
            max_tokens=900,
        )

    return IsolateResponse(
        detected_object=output.detected_object,
        contextual_description=output.contextual_description,
        price_breakdown=output.price_breakdown or None,
        safety_precautions=[item.strip() for item in output.safety_precautions if item.strip()],
        segment_bbox=BoundingBox(x=isolation.x, y=isolation.y, width=isolation.width, height=isolation.height),
        **timer.report(),
    )


def _clamp_focus(bbox: BoundingBox | None, width: int, height: int) -> Box | None:
    if bbox is None:
        return None
    left = min(max(bbox.x, 0), width)
    top = min(max(bbox.y, 0), height)
    right = min(max(bbox.x + bbox.width, 0), width)
    bottom = min(max(bbox.y + bbox.height, 0), height)
    if right - left < 2 or bottom - top < 2:
        raise BadPayload(f"focus_bbox does not overlap the {width}x{height} image.")
    return Box(left, top, right - left, bottom - top)


_MARKDOWN = re.compile(r"(\*\*|__|`|^#{1,6}\s+|^\s*[-*•]\s+)", re.MULTILINE)


def _plain(text: str) -> str:
    """The app renders structure itself, so stray markdown from the model is stripped."""
    return " ".join(_MARKDOWN.sub("", text).split())


def _clean_find(phrases: list[str]) -> list[str]:
    cleaned: list[str] = []
    for phrase in phrases:
        text = " ".join(str(phrase).split())[:40]
        if text and text.lower() not in (item.lower() for item in cleaned):
            cleaned.append(text)
    return cleaned[:MAX_FIND_CONCEPTS]


def _coordinates(latitude: float | None, longitude: float | None) -> tuple[float, float] | None:
    return (latitude, longitude) if latitude is not None and longitude is not None else None


# Landmark lookups add up to ~2.5 s, so they run for the Places scene and for questions about places, not for
# "is this spicy?" on a menu. GPS and the place name still reach every prompt.
_PLACE_QUESTION = re.compile(
    r"\b(where|place|here|area|neighbou?rhood|district|landmark|building|monument|temple|church|mosque|museum|"
    r"history|historic|built|famous|street|square|park|station|near|nearby|around|visit|city|town)\b",
    re.IGNORECASE,
)


def _wants_landmarks(body: AskRequest) -> bool:
    if body.scene == "general":
        return True
    recent = " ".join([body.question, *(turn.question for turn in body.history[-2:])])
    return bool(_PLACE_QUESTION.search(recent))


async def _nearby(engines: Engines, body: AskRequest) -> list[NearbyPlace]:
    if engines.places is None or body.latitude is None or body.longitude is None or not _wants_landmarks(body):
        return []
    try:
        return (await engines.places.nearby(body.latitude, body.longitude))[:MAX_NEARBY_PLACES]
    except Exception:  # The lookup is optional grounding; never fail the answer because of it.
        logger.exception("Nearby place lookup failed")
        return []


@router.post("/api/vision/ask")
async def ask(
    body: AskRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> StreamingResponse:
    """Answers a free-form question about a photo, as newline-delimited JSON events.

    1. `{"type": "answer", "title", "answer", "find", "latency_ms", "timings"}` as soon as the model replies.
    2. `{"type": "highlights", "segments": [...], "latency_ms", "timings"}` with SAM 3.1 boxes for the
       things named in `find`. Only sent when `find` is non-empty; segments is [] if SAM finds nothing or fails.

    Image, place lookup and model failures happen before the response starts and keep normal HTTP statuses.
    """
    places_task = asyncio.create_task(_nearby(engines, body))
    try:
        with timer.stage("load_image"):
            image_bytes = await _load_image(body.image_id, body.image_b64, engines, settings)
            image = open_rgb_image(image_bytes)
        width, height = image.size
        focus = _clamp_focus(body.focus_bbox, width, height)

        with timer.stage("render"):
            jpeg = (
                render_context(image, focus, max_edge=ASK_IMAGE_MAX_EDGE)
                if focus
                else encode_jpeg(downscale(image, ASK_IMAGE_MAX_EDGE), quality=85)
            )
        with timer.stage("places"):
            nearby = await places_task
    finally:
        if not places_task.done():
            places_task.cancel()

    with timer.stage("muse"):
        output = await complete_structured(
            engines.llm,
            system_prompt=VISION_ASK_SYSTEM,
            user_content=vision_ask_user(
                question=body.question,
                scene=body.scene,
                traveler_locale=body.traveler_locale,
                home_currency=body.home_currency,
                has_focus=focus is not None,
                location=_coordinates(body.latitude, body.longitude),
                nearby=[(place.name, place.distance_m) for place in nearby],
                image_url=to_data_url(jpeg),
                traveler_needs=body.traveler_needs,
                place_label=body.place_label,
                history=[(turn.question, turn.answer) for turn in body.history[-MAX_HISTORY_TURNS:]],
            ),
            output_model=AskModelOutput,
            max_tokens=1000,
        )

    find = _clean_find(output.find)
    first = ndjson_line(
        {
            "type": "answer",
            "title": _plain(output.title),
            "answer": _plain(output.answer),
            "points": [
                {"label": _plain(p.label), "text": _plain(p.text), "price": _plain(p.price or "") or None}
                for p in output.points
                if _plain(p.label)
            ][:MAX_POINTS],
            "alerts": [_plain(a) for a in output.alerts if _plain(a)][:MAX_ALERTS],
            "find": find,
            **timer.report(),
        }
    )

    async def events() -> AsyncIterator[bytes]:
        yield first
        if not find:
            return
        segments: list[Segment] = []
        try:
            with timer.stage("sam"):
                raw = await engines.segmenter.segment(image_bytes, find)
            segments = _segments(raw, width=width, height=height, prefix="hl", max_count=MAX_HIGHLIGHTS)
        except Exception:  # Highlights are a bonus on top of the answer the traveler already has.
            logger.exception("Highlight segmentation failed for %s", find)
        yield ndjson_line(
            {"type": "highlights", "segments": [item.model_dump() for item in segments], **timer.report()}
        )

    return StreamingResponse(events(), media_type=NDJSON_MEDIA_TYPE, headers=NDJSON_HEADERS)
