from __future__ import annotations

from fastapi import APIRouter, Depends

from songa.core.telemetry import StageTimer, request_timer
from songa.engines import Engines
from songa.llm.prompts import LOCAL_CARD_SYSTEM, local_card_user
from songa.llm.structured import complete_structured
from songa.routes.deps import get_engines
from songa.schemas import CardPhrase, LocalCardModelOutput, LocalCardRequest, LocalCardResponse

router = APIRouter()

MAX_PHRASES = 6


@router.post("/api/cards/local", response_model=LocalCardResponse)
async def local_card(
    body: LocalCardRequest,
    engines: Engines = Depends(get_engines),
    timer: StageTimer = Depends(request_timer),
) -> LocalCardResponse:
    """Writes a show-a-local card (way home, or dietary and medical needs) in the local language.

    The phone stores the result so the card works offline afterwards.
    """
    coordinates = (body.latitude, body.longitude) if body.latitude is not None and body.longitude is not None else None
    with timer.stage("muse"):
        output = await complete_structured(
            engines.llm,
            system_prompt=LOCAL_CARD_SYSTEM,
            user_content=local_card_user(
                kind=body.kind,
                target_locale=body.target_locale,
                target_country=body.target_country,
                traveler_locale=body.traveler_locale,
                place_name=body.place_name,
                address=body.address,
                coordinates=coordinates,
                allergies=[item.strip() for item in body.allergies],
                diet=[item.strip() for item in body.diet],
                notes=body.notes,
            ),
            output_model=LocalCardModelOutput,
            max_tokens=1200,
        )

    phrases = [
        CardPhrase(local=phrase.local.strip(), meaning=phrase.meaning.strip())
        for phrase in output.phrases
        if phrase.local.strip() and phrase.meaning.strip()
    ][:MAX_PHRASES]
    return LocalCardResponse(
        kind=body.kind,
        target_locale=body.target_locale,
        title_local=output.title_local.strip(),
        title_meaning=output.title_meaning.strip(),
        body_local=output.body_local.strip(),
        body_meaning=output.body_meaning.strip(),
        phrases=phrases,
        **timer.report(),
    )
