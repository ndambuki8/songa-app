"""Modal deployment for the Songa backend. Run these from the `backend/` directory.

    modal deploy modal_app.py          # production
    modal serve modal_app.py           # hot-reloading dev endpoint
    modal run modal_app.py::smoke      # checks the Meta API key against Muse, SAM 3.1 and Voice Transcribe
    SONGA_WARM=1 modal deploy modal_app.py   # keep one gateway container warm for a demo

    modal run modal_app.py::benchmark_sam    # SAM latency: Meta API vs Songa's own L4 GPU, side by side

Architecture: a small CPU-only FastAPI gateway (`songa-gateway`). Muse Wonder (reasoning) and Muse Voice
Transcribe (speech) run on the Meta Model API. Segmentation runs on either the Meta API (`SAM_BACKEND=meta`,
the default) or Songa's own SAM 3 on an L4 GPU (`SAM_BACKEND=modal`, class `SamGpu`). The GPU container scales
to zero when idle.
"""

from __future__ import annotations

import os

import modal

APP_NAME = "songa"
WARM_CONTAINERS = 1 if os.environ.get("SONGA_WARM") == "1" else 0
# Keep an idle container alive between conversation turns so only the first request of a session pays the
# cold start (~5 s measured). The gateway is a small CPU container, so idle time is cheap. Modal allows 2-1200.
SCALEDOWN_WINDOW_S = int(os.environ.get("SONGA_SCALEDOWN_S", "300"))

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

# --- Self-hosted SAM 3 on an L4 -------------------------------------------------------------------------------
# Weights (~3.5 GB) are downloaded once into a Volume, so later cold starts only load them from disk.
# Preference order. The A10 (24 GB, ~$1.10/h) is only used when Modal has no free L4: a request once waited
# more than 3 minutes for L4 capacity. Set SONGA_SAM_GPU=L4 to never use anything else.
SAM_GPU = [gpu.strip() for gpu in os.environ.get("SONGA_SAM_GPU", "L4,A10").split(",") if gpu.strip()]
# GPU memory snapshots (Modal alpha) restore loaded, warmed-up weights instead of re-initialising them.
SAM_SNAPSHOT = os.environ.get("SONGA_SAM_SNAPSHOT", "1") == "1"
# Idle GPU time is billed (~$0.80/h on an L4), so this is shorter than the gateway's window.
SAM_SCALEDOWN_S = int(os.environ.get("SONGA_SAM_SCALEDOWN_S", "180"))
SAM_WARM_CONTAINERS = 1 if os.environ.get("SONGA_SAM_WARM") == "1" else 0
hf_cache = modal.Volume.from_name("songa-hf-cache", create_if_missing=True)

sam_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.6",
        "torchvision",
        "transformers>=5.0",
        "huggingface_hub",
        "pillow>=10.4",
        "numpy>=1.26",
    )
    .env({"HF_HOME": "/cache/huggingface", "HF_XET_HIGH_PERFORMANCE": "1"})
    .add_local_python_source("songa")
)


@app.cls(
    image=sam_image,
    gpu=SAM_GPU,
    secrets=secrets,  # HF_TOKEN for the gated facebook/sam3 weights
    volumes={"/cache": hf_cache},
    timeout=120,
    scaledown_window=SAM_SCALEDOWN_S,
    min_containers=SAM_WARM_CONTAINERS,
    enable_memory_snapshot=SAM_SNAPSHOT,
    experimental_options={"enable_gpu_snapshot": True} if SAM_SNAPSHOT else None,
)
@modal.concurrent(max_inputs=4)
class SamGpu:
    # With snapshots on, this runs once per snapshot; later containers restore its result in a few seconds.
    @modal.enter(snap=SAM_SNAPSHOT)
    def load(self) -> None:
        import time

        from songa.services.sam_local import Sam3Runner

        started = time.perf_counter()
        self.runner = Sam3Runner(os.environ.get("SAM_LOCAL_MODEL_ID", "facebook/sam3"))
        self.runner.load()
        hf_cache.commit()
        print(f"SAM 3 loaded and warmed in {time.perf_counter() - started:.1f}s")

    @modal.enter(snap=False)
    def report_start(self) -> None:
        print("SAM GPU container ready")

    @modal.method()
    def segment(self, jpeg: bytes, concepts: list[str], threshold: float) -> list[dict]:
        return self.runner.segment(jpeg, concepts, threshold)

    @modal.method()
    def isolate(self, jpeg: bytes, x: int, y: int) -> dict:
        return self.runner.isolate(jpeg, x, y)

    @modal.method()
    def ping(self) -> str:
        """Boots a container (weights loaded by `load`) without doing any work."""
        return "ready"


def build_engines():
    from songa.config import Settings
    from songa.engines import Engines
    from songa.llm.muse_client import MuseWonderClient
    from songa.services.meta_api import MetaApiClient
    from songa.services.meta_sam import MetaSamSegmenter
    from songa.services.meta_transcriber import MetaVoiceTranscriber
    from songa.services.places import WikipediaPlaces
    from songa.stores import ModalDictImageStore

    settings = Settings.from_env()
    media = MetaApiClient(
        api_key=settings.meta_api_key, base_url=settings.meta_api_base_url, timeout_s=settings.media_timeout_s
    )
    if settings.sam_backend == "modal":
        from songa.services.gpu_sam import GpuSamSegmenter

        # Hosted SAM serves requests while the GPU boots, so a cold or capacity-starved GPU never blocks Look.
        segmenter = GpuSamSegmenter(
            SamGpu(),
            score_threshold=settings.sam_score_threshold,
            fallback=MetaSamSegmenter(media, model=settings.sam_model_id, score_threshold=settings.sam_score_threshold),
            ready_window_s=max(SAM_SCALEDOWN_S - 30, 10),
        )
    else:
        segmenter = MetaSamSegmenter(media, model=settings.sam_model_id, score_threshold=settings.sam_score_threshold)
    engines = Engines(
        stt=MetaVoiceTranscriber(media, model=settings.transcribe_model_id),
        segmenter=segmenter,
        images=ModalDictImageStore(image_cache, settings.image_cache_ttl_s),
        llm=MuseWonderClient(
            api_key=settings.meta_api_key,
            base_url=settings.meta_api_base_url,
            model=settings.muse_model_id,
            reasoning_effort=settings.muse_reasoning_effort,
            json_mode=settings.muse_json_mode,
            timeout_s=settings.muse_timeout_s,
        ),
        places=WikipediaPlaces(contact=os.environ.get("SONGA_CONTACT", "")),
    )
    return settings, engines


@app.function(
    image=gateway_image,
    secrets=secrets,
    timeout=240,
    min_containers=WARM_CONTAINERS,
    scaledown_window=SCALEDOWN_WINDOW_S,
)
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


BENCH_PHOTOS = {
    # Public COCO photos: a kitchen scene and a dining table, close to what travelers photograph.
    "kitchen": "http://images.cocodataset.org/val2017/000000136466.jpg",
    "dining": "http://images.cocodataset.org/val2017/000000397133.jpg",
}
BENCH_CONCEPTS = ["food", "bottle", "sign", "text"]


@app.function(image=gateway_image, secrets=secrets, timeout=900)
async def compare_sam(only: str = "both") -> list[str]:
    """Runs the same photos through the Meta API SAM and the L4 SAM from the gateway's network position."""
    import time

    import httpx

    from songa.config import Settings
    from songa.core.media import encode_jpeg, open_rgb_image
    from songa.services.gpu_sam import GpuSamSegmenter
    from songa.services.meta_api import MetaApiClient
    from songa.services.meta_sam import MetaSamSegmenter
    from songa.vision.geometry import refine_segments

    settings = Settings.from_env()
    media = MetaApiClient(api_key=settings.meta_api_key, base_url=settings.meta_api_base_url, timeout_s=90)
    backends = {
        "meta-api": MetaSamSegmenter(media, model=settings.sam_model_id, score_threshold=settings.sam_score_threshold),
        "l4-gpu": GpuSamSegmenter(SamGpu(), score_threshold=settings.sam_score_threshold, cold_timeout_s=600),
    }
    if only in backends:
        backends = {only: backends[only]}
    lines: list[str] = []
    async with httpx.AsyncClient(timeout=30) as client:
        photos = {name: (await client.get(url)).content for name, url in BENCH_PHOTOS.items()}

    async def timed(call):
        started = time.perf_counter()
        try:
            value = await call
            return (time.perf_counter() - started) * 1000, value, None
        except Exception as exc:  # report, don't abort the comparison
            return (time.perf_counter() - started) * 1000, None, f"{type(exc).__name__}: {exc}"

    for backend, segmenter in backends.items():
        lines.append(f"\n== {backend}")
        for round_index in range(2):
            for name, raw in photos.items():
                picture = open_rgb_image(raw)
                jpeg = encode_jpeg(picture, quality=90)
                ms, found, error = await timed(segmenter.segment(jpeg, BENCH_CONCEPTS))
                label = "cold" if backend == "l4-gpu" and round_index == 0 and name == "kitchen" else "warm"
                if error:
                    lines.append(f"  segment {name:8} {label}: {ms:7.0f} ms  FAILED {error}")
                    continue
                kept = refine_segments(found, image_w=picture.width, image_h=picture.height)
                counts = {c: sum(1 for s in kept if s.label == c) for c in BENCH_CONCEPTS}
                lines.append(f"  segment {name:8} {label}: {ms:7.0f} ms  kept {len(kept):2d} {counts}")
                for tap in range(2):
                    x, y = picture.width // 2 + tap * 40, picture.height // 2
                    ms, iso, error = await timed(segmenter.isolate(jpeg, x, y))
                    detail = error or f"box {iso.width}x{iso.height} score {iso.mask_score:.2f}"
                    lines.append(f"  isolate {name:8} tap{tap}: {ms:7.0f} ms  {detail}")
    return lines


@app.local_entrypoint()
def benchmark_sam(only: str = "both") -> None:
    """`modal run modal_app.py::benchmark_sam [--only meta-api|l4-gpu]`"""
    for line in compare_sam.remote(only):
        print(line)
