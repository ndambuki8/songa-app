"""Speech-to-text through Meta Muse Voice Transcribe (`POST /v1/asr/transcribe`).

The endpoint only accepts mono 16-bit PCM WAV at 16 or 24 kHz, while the phone records AAC in an m4a
container, so every clip is converted with ffmpeg first.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path

from songa.core.errors import ServiceMisconfigured, UnprocessableMedia
from songa.engines import Transcript
from songa.services.meta_api import MetaApiClient

logger = logging.getLogger(__name__)

SAMPLE_RATE_HZ = 24_000
FFMPEG_TIMEOUT_S = 30

# Languages Muse Voice Transcribe accepts as `languageBias`, keyed by ISO 639-1 code.
BIAS_LANGUAGES: dict[str, str] = {
    "ar": "Arabic",
    "bn": "Bengali",
    "de": "German",
    "en": "English",
    "es": "Spanish",
    "fil": "Tagalog",
    "fr": "French",
    "he": "Hebrew",
    "hi": "Hindi",
    "id": "Indonesian",
    "it": "Italian",
    "ja": "Japanese",
    "kn": "Kannada",
    "ko": "Korean",
    "mr": "Marathi",
    "ms": "Malay",
    "nl": "Dutch",
    "pl": "Polish",
    "pt": "Portuguese",
    "ta": "Tamil",
    "te": "Telugu",
    "th": "Thai",
    "tl": "Tagalog",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "zh": "Mandarin Chinese",
}

WavConverter = Callable[[bytes], Awaitable[bytes]]


async def convert_to_wav(audio: bytes) -> bytes:
    """Transcodes any ffmpeg-readable clip to mono 16-bit PCM WAV.

    Files rather than pipes on both ends: m4a often stores its index after the audio, which needs a seekable
    input, and a piped WAV header carries no data length.
    """
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise ServiceMisconfigured("ffmpeg is not installed on the server.")

    with tempfile.TemporaryDirectory() as workdir:
        source = Path(workdir, "input")
        target = Path(workdir, "output.wav")
        source.write_bytes(audio)
        process = await asyncio.create_subprocess_exec(
            ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-i", str(source),
            "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE_HZ), "-c:a", "pcm_s16le", "-f", "wav",
            str(target),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )  # fmt: skip
        try:
            _, stderr = await asyncio.wait_for(process.communicate(), timeout=FFMPEG_TIMEOUT_S)
        except asyncio.TimeoutError as exc:
            process.kill()
            raise UnprocessableMedia("The recording took too long to decode. Record a shorter clip.") from exc
        if process.returncode != 0 or not target.exists():
            logger.warning("ffmpeg failed (%s): %s", process.returncode, stderr.decode(errors="replace")[-400:])
            raise UnprocessableMedia("The audio could not be decoded. Record again.", code="undecodable_audio")
        return target.read_bytes()


def language_bias(language_hint: str | None) -> list[str]:
    if not language_hint:
        return []
    name = BIAS_LANGUAGES.get(language_hint.lower())
    return [name] if name else []


class MetaVoiceTranscriber:
    """`SpeechToText` backed by Muse Voice Transcribe in push-to-talk mode (one utterance per clip)."""

    def __init__(self, client: MetaApiClient, *, model: str, to_wav: WavConverter = convert_to_wav) -> None:
        self._client = client
        self._model = model
        self._to_wav = to_wav

    async def transcribe(self, audio: bytes, language_hint: str | None) -> Transcript:
        wav = await self._to_wav(audio)

        request: dict[str, object] = {"model": self._model, "mode": "PUSH_TO_TALK", "audioEncoding": "WAV"}
        bias = language_bias(language_hint)
        if bias:
            request["languageBias"] = bias

        payload = await self._client.post(
            "/asr/transcribe",
            service="Muse Voice Transcribe",
            files={
                "request": (None, json.dumps(request), "application/json"),
                "audio": ("speech.wav", wav, "audio/wav"),
            },
            bad_request=UnprocessableMedia("The recording could not be transcribed. Record again.", code="undecodable_audio"),
        )
        text = payload.get("transcript") if isinstance(payload, dict) else None
        # The API reports no detected language; Muse Wonder infers it from the transcript downstream.
        return Transcript(text=text.strip() if isinstance(text, str) else "", language=None)
