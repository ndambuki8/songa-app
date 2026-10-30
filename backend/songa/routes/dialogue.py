from __future__ import annotations

from fastapi import APIRouter, Depends

from songa.config import Settings
from songa.core.errors import UnprocessableMedia
from songa.core.media import decode_base64_payload
from songa.core.telemetry import StageTimer, request_timer
from songa.engines import Engines
from songa.llm.prompts import INTENT_BRIDGE_SYSTEM, intent_bridge_user
from songa.llm.structured import complete_structured
from songa.routes.deps import get_engines, get_settings, language_code
from songa.schemas import (
    IntentBridgeRequest,
    IntentBridgeResponse,
    IntentModelOutput,
    TranscribeRequest,
    TranscribeResponse,
)

router = APIRouter()


@router.post("/api/dialogue/intent-bridge", response_model=IntentBridgeResponse)
async def intent_bridge(
    body: IntentBridgeRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> IntentBridgeResponse:
    with timer.stage("decode"):
        audio = decode_base64_payload(body.audio_b64, max_bytes=settings.max_audio_bytes, label="audio")

    with timer.stage("transcribe"):
        transcript = await engines.stt.transcribe(audio, language_code(body.source_locale))
    if not transcript.text.strip():
        raise UnprocessableMedia("No speech was detected in the recording.", code="no_speech")

    with timer.stage("muse"):
        output = await complete_structured(
            engines.llm,
            system_prompt=INTENT_BRIDGE_SYSTEM,
            user_content=intent_bridge_user(
                transcript=transcript.text,
                detected_language=transcript.language,
                source_locale=body.source_locale,
                target_locale=body.target_locale,
                target_country=body.target_country,
            ),
            output_model=IntentModelOutput,
            max_tokens=600,
        )

    return IntentBridgeResponse(
        raw_transcription=transcript.text,
        detected_language=transcript.language,
        extracted_intent=output.extracted_intent,
        culturally_refined_translation=output.culturally_refined_translation,
        politeness_notes=output.politeness_notes,
        target_locale=body.target_locale,
        **timer.report(),
    )


@router.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe(
    body: TranscribeRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> TranscribeResponse:
    with timer.stage("decode"):
        audio = decode_base64_payload(body.audio_b64, max_bytes=settings.max_audio_bytes, label="audio")
    with timer.stage("transcribe"):
        transcript = await engines.stt.transcribe(audio, language_code(body.language_hint))
    return TranscribeResponse(text=transcript.text.strip(), detected_language=transcript.language, **timer.report())
