from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends

from songa.core.errors import BadPayload
from songa.core.telemetry import StageTimer, request_timer
from songa.engines import Engines
from songa.llm.prompts import TRIP_BRIEFING_SYSTEM, trip_briefing_user
from songa.llm.structured import complete_structured
from songa.routes.deps import get_engines
from songa.schemas import TripBriefingModelOutput, TripBriefingRequest, TripBriefingResponse, TripDay

router = APIRouter()

MAX_PHRASES = 12
MAX_TIPS = 5
MAX_SUGGESTIONS = 4
MAX_EMERGENCY_NUMBERS = 4


def trip_dates(start_date: str, days: int) -> list[str]:
    try:
        start = date.fromisoformat(start_date)
    except ValueError as exc:
        raise BadPayload(f"start_date {start_date} is not a calendar date.") from exc
    return [(start + timedelta(days=offset)).isoformat() for offset in range(days)]


def _clean(items: list[str], limit: int) -> list[str]:
    return [item.strip() for item in items if item.strip()][:limit]


def align_days(days: list[TripDay], dates: list[str]) -> list[TripDay]:
    """Pins each planned day to the real trip calendar, whatever dates the model wrote."""
    planned = [day for day in days if day.title.strip()]
    return [
        day.model_copy(update={"date": dates[index], "suggestions": _clean(day.suggestions, MAX_SUGGESTIONS)})
        for index, day in enumerate(planned[: len(dates)])
    ]


@router.post("/api/trip/briefing", response_model=TripBriefingResponse)
async def trip_briefing(
    body: TripBriefingRequest,
    engines: Engines = Depends(get_engines),
    timer: StageTimer = Depends(request_timer),
) -> TripBriefingResponse:
    dates = trip_dates(body.start_date, body.days)

    with timer.stage("muse"):
        output = await complete_structured(
            engines.llm,
            system_prompt=TRIP_BRIEFING_SYSTEM,
            user_content=trip_briefing_user(
                destination=body.destination.strip(),
                dates=dates,
                stay=body.stay.strip() if body.stay else None,
                needs=body.needs.strip() if body.needs else None,
                traveler_locale=body.traveler_locale,
                destination_locale=body.destination_locale,
                home_currency=body.home_currency,
            ),
            output_model=TripBriefingModelOutput,
            max_tokens=3500,
        )

    return TripBriefingResponse(
        destination=body.destination.strip(),
        destination_locale=body.destination_locale,
        summary=output.summary.strip(),
        days=align_days(output.days, dates),
        phrases=[p for p in output.phrases if p.phrase.strip() and p.meaning.strip()][:MAX_PHRASES],
        etiquette=_clean(output.etiquette, MAX_TIPS),
        safety=_clean(output.safety, MAX_TIPS),
        money=_clean(output.money, MAX_TIPS),
        getting_around=_clean(output.getting_around, MAX_TIPS),
        emergency_numbers=[n for n in output.emergency_numbers if n.number.strip()][:MAX_EMERGENCY_NUMBERS],
        **timer.report(),
    )
