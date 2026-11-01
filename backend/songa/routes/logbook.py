from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends

from songa.config import Settings
from songa.core.errors import PayloadTooLarge
from songa.core.media import decode_base64_payload, downscale, encode_jpeg, open_rgb_image, to_data_url
from songa.core.telemetry import StageTimer, request_timer
from songa.engines import Engines
from songa.llm.prompts import ITINERARY_SYSTEM, itinerary_user_header
from songa.llm.structured import complete_structured
from songa.routes.deps import get_engines, get_settings
from songa.schemas import CompileItineraryRequest, CompileItineraryResponse, ItineraryEvent, ItineraryModelOutput

router = APIRouter()

ITINERARY_IMAGE_MAX_EDGE = 1024


def utc_offset(date: str, timezone: str) -> str:
    try:
        moment = datetime.fromisoformat(f"{date}T12:00:00").replace(tzinfo=ZoneInfo(timezone))
    except (ZoneInfoNotFoundError, ValueError):
        return "+00:00"
    offset = moment.strftime("%z")
    return f"{offset[:3]}:{offset[3:]}" if offset else "+00:00"


def _parse_timestamp(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def order_events(events: list[ItineraryEvent], valid_ids: set[str]) -> list[ItineraryEvent]:
    """Enforces chronology deterministically and drops references to entries that were never sent."""
    cleaned = [
        event.model_copy(update={"source_entry_ids": [i for i in event.source_entry_ids if i in valid_ids]})
        for event in events
        if event.activity.strip()
    ]
    dated: list[tuple[float, ItineraryEvent]] = []
    undated: list[ItineraryEvent] = []
    for event in cleaned:
        parsed = _parse_timestamp(event.timestamp)
        if parsed is None:
            undated.append(event)
        else:
            dated.append((parsed.timestamp(), event))
    dated.sort(key=lambda pair: pair[0])
    return [event for _, event in dated] + undated


@router.post("/api/logbook/compile-itinerary", response_model=CompileItineraryResponse)
async def compile_itinerary(
    body: CompileItineraryRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> CompileItineraryResponse:
    if len(body.entries) > settings.max_logbook_entries:
        raise PayloadTooLarge(f"At most {settings.max_logbook_entries} entries can be compiled at once.")

    with timer.stage("prepare"):
        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": itinerary_user_header(
                    date=body.date,
                    timezone=body.timezone,
                    traveler_locale=body.traveler_locale,
                    utc_offset=utc_offset(body.date, body.timezone),
                ),
            }
        ]
        for entry in sorted(body.entries, key=lambda e: e.captured_at):
            descriptor: dict[str, Any] = {"id": entry.id, "kind": entry.kind, "captured_at": entry.captured_at}
            if entry.text:
                descriptor["text"] = entry.text.strip()
            if entry.latitude is not None and entry.longitude is not None:
                descriptor["coordinates"] = [round(entry.latitude, 5), round(entry.longitude, 5)]
            content.append({"type": "text", "text": f"ENTRY {json.dumps(descriptor, ensure_ascii=False)}"})
            if entry.image_b64:
                raw = decode_base64_payload(entry.image_b64, max_bytes=settings.max_image_bytes, label=f"photo {entry.id}")
                image = downscale(open_rgb_image(raw), ITINERARY_IMAGE_MAX_EDGE)
                content.append({"type": "image_url", "image_url": {"url": to_data_url(encode_jpeg(image, quality=80))}})

    with timer.stage("muse"):
        output = await complete_structured(
            engines.llm,
            system_prompt=ITINERARY_SYSTEM,
            user_content=content,
            output_model=ItineraryModelOutput,
            max_tokens=2500,
        )

    events = order_events(output.events, {entry.id for entry in body.entries})
    to_do = [item.strip() for item in output.to_do if item.strip()]
    return CompileItineraryResponse(summary=output.summary, events=events, to_do=to_do, **timer.report())
