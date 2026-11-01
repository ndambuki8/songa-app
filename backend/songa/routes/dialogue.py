from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from songa.config import Settings
from songa.core.errors import SongaError, UnprocessableMedia
from songa.core.media import decode_base64_payload
from songa.core.ndjson import NDJSON_HEADERS, NDJSON_MEDIA_TYPE, ndjson_line as _ndjson
from songa.core.telemetry import StageTimer, request_timer
from songa.engines import Engines, Transcript
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

logger = logging.getLogger(__name__)
router = APIRouter()

# With "minimal" effort replies are ~150 tokens; the headroom avoids truncated JSON (and a repair round trip)
# when the configured effort is higher.
INTENT_MAX_TOKENS = 800


async def _transcribe_clip(
    body: IntentBridgeRequest, engines: Engines, settings: Settings, timer: StageTimer
) -> Transcript:
    with timer.stage("decode"):
        audio = decode_base64_payload(body.audio_b64, max_bytes=settings.max_audio_bytes, label="audio")
    with timer.stage("transcribe"):
        transcript = await engines.stt.transcribe(audio, language_code(body.source_locale))
    if not transcript.text.strip():
        raise UnprocessableMedia("No speech was detected in the recording.", code="no_speech")
    return transcript


async def _interpret(
    body: IntentBridgeRequest, transcript: Transcript, engines: Engines, settings: Settings, timer: StageTimer
) -> IntentBridgeResponse:
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
            max_tokens=INTENT_MAX_TOKENS,
            reasoning_effort=settings.speak_reasoning_effort or None,
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


@router.post("/api/dialogue/intent-bridge", response_model=IntentBridgeResponse)
async def intent_bridge(
    body: IntentBridgeRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> IntentBridgeResponse:
    transcript = await _transcribe_clip(body, engines, settings, timer)
    return await _interpret(body, transcript, engines, settings, timer)


@router.post("/api/dialogue/intent-bridge/stream")
async def intent_bridge_stream(
    body: IntentBridgeRequest,
    engines: Engines = Depends(get_engines),
    settings: Settings = Depends(get_settings),
    timer: StageTimer = Depends(request_timer),
) -> StreamingResponse:
    """Same pipeline as `/intent-bridge`, as newline-delimited JSON events.

    1. `{"type": "transcript", "text", "latency_ms"}` as soon as speech-to-text finishes, so the phone can show
       what it heard while the translation is being written.
    2. `{"type": "result", ...IntentBridgeResponse}` with the translation, or
       `{"type": "error", "status", "error": {"code", "message"}, "latency_ms"}` if the language model fails.

    Decoding and transcription happen before the response starts, so their failures keep normal HTTP statuses.
    """
    transcript = await _transcribe_clip(body, engines, settings, timer)
    first = _ndjson({"type": "transcript", "text": transcript.text, **timer.report()})

    async def events() -> AsyncIterator[bytes]:
        yield first
        try:
            result = await _interpret(body, transcript, engines, settings, timer)
            yield _ndjson({"type": "result", **result.model_dump()})
        except SongaError as exc:
            if exc.status_code >= 500:
                logger.warning("intent-bridge/stream -> %s %s", exc.code, exc.message)
            yield _ndjson(
                {
                    "type": "error",
                    "status": exc.status_code,
                    "error": {"code": exc.code, "message": exc.message},
                    "latency_ms": timer.report()["latency_ms"],
                }
            )
        except Exception:
            logger.exception("Unhandled error in intent-bridge/stream")
            yield _ndjson(
                {
                    "type": "error",
                    "status": 500,
                    "error": {"code": "internal_error", "message": "An unexpected server error occurred."},
                    "latency_ms": timer.report()["latency_ms"],
                }
            )

    return StreamingResponse(events(), media_type=NDJSON_MEDIA_TYPE, headers=NDJSON_HEADERS)


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
