"""Modal deployment for the Songa backend. Run these from the `backend/` directory.

    modal deploy modal_app.py          # production
    modal serve modal_app.py           # hot-reloading dev endpoint
    modal run modal_app.py::smoke      # checks the Meta API key against Muse, SAM 3.1 and Voice Transcribe
    SONGA_WARM=1 modal deploy modal_app.py   # keep one gateway container warm for a demo

Architecture: a single CPU-only FastAPI gateway (`songa-gateway`). All model inference runs on the Meta
Model API: Muse Wonder for reasoning, SAM 3.1 for segmentation and Muse Voice Transcribe for speech.
No GPUs are provisioned.
"""

from __future__ import annotations

import os

import modal

APP_NAME = "songa"
WARM_CONTAINERS = 1 if os.environ.get("SONGA_WARM") == "1" else 0

app = modal.App(APP_NAME)
secrets = [modal.Secret.from_name("songa-secrets")]
image_cache = modal.Dict.from_name("songa-image-cache", create_if_missing=True)

gateway_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "fastapi[standard]>=0.115",
        "httpx>=0.27",
        "pydantic>=2.8",
        "pillow>=10.4",
        "numpy>=1.26",
        "meta-sam-parser>=0.0.6",
    )
    .add_local_python_source("songa")
)


def build_engines():
    from songa.bootstrap import build_meta_engines
    from songa.config import Settings
    from songa.stores import ModalDictImageStore

    settings = Settings.from_env()
    engines = build_meta_engines(settings, ModalDictImageStore(image_cache, settings.image_cache_ttl_s))
    return settings, engines


@app.function(image=gateway_image, secrets=secrets, timeout=240, min_containers=WARM_CONTAINERS)
@modal.concurrent(max_inputs=32)
@modal.asgi_app(label="songa-gateway")
def gateway():
    from songa.gateway import create_app

    settings, engines = build_engines()
    return create_app(settings, engines)


@app.function(image=gateway_image, secrets=secrets, timeout=180)
async def check_meta_access() -> list[str]:
    """Makes one small real call to each Meta model and reports what happened."""
    import io

    from PIL import Image, ImageDraw

    from songa.core.media import encode_jpeg
    from songa.services.meta_transcriber import convert_to_wav

    _, engines = build_engines()
    report: list[str] = []

    async def probe(name: str, call) -> None:
        try:
            report.append(f"OK    {name}: {await call}")
        except Exception as exc:
            report.append(f"FAIL  {name}: {type(exc).__name__}: {exc}")

    await probe("Muse Wonder", engines.llm.complete([{"role": "user", "content": 'Reply with the JSON object {"status": "ready"}.'}], max_tokens=200))

    picture = Image.new("RGB", (480, 320), (245, 240, 230))
    ImageDraw.Draw(picture).rectangle((140, 90, 340, 230), fill=(200, 30, 30))
    photo = encode_jpeg(picture)
    await probe("SAM 3.1 concept", engines.segmenter.segment(photo, ["red square"]))
    await probe("SAM 3.1 point", _summarize_isolation(engines.segmenter.isolate(photo, 240, 160)))

    silence = io.BytesIO()
    _write_silent_wav(silence)
    await probe("ffmpeg", _length(convert_to_wav(silence.getvalue())))
    await probe("Voice Transcribe", engines.stt.transcribe(silence.getvalue(), "en"))
    return report


async def _summarize_isolation(call):
    isolation = await call
    return f"box=({isolation.x},{isolation.y},{isolation.width}x{isolation.height}) score={isolation.mask_score:.2f}"


async def _length(call):
    return f"{len(await call)} WAV bytes"


def _write_silent_wav(buffer) -> None:
    import wave

    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24_000)
        wav.writeframes(b"\x00\x00" * 24_000)


@app.local_entrypoint()
def smoke() -> None:
    for line in check_meta_access.remote():
        print(line)
