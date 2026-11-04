"""Orchestrates one evaluation run inside Modal and writes everything to /vol/results/<run_id>/.

Files written:
    run.log              progress and errors
    config.json          parameters, models and dataset counts
    asr_per_clip.jsonl   one line per audio clip
    seg_prompts.jsonl    one line per (backend, image, text prompt)
    seg_taps.jsonl       one line per (backend, tap)
    results.json         all aggregate metrics (rewritten after each stage)
    summary.md           human-readable tables
"""

from __future__ import annotations

import asyncio
import csv
import json
import logging
import time
import warnings
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import numpy as np

warnings.filterwarnings("ignore", message=".*nearest match.*")
logger = logging.getLogger("songa.eval")

# Errors that retrying will not fix.
NON_RETRYABLE = ("UnprocessableMedia", "BadPayload")


async def with_retries(call: Callable[[], Awaitable[Any]], *, what: str, attempts: int = 4) -> Any:
    for attempt in range(1, attempts + 1):
        try:
            return await call()
        except Exception as exc:  # noqa: BLE001 - every failure is logged and either retried or recorded
            if type(exc).__name__ in NON_RETRYABLE or attempt == attempts:
                raise
            wait = 2**attempt
            logger.warning("%s failed (%s: %s); retry %d in %ds", what, type(exc).__name__, exc, attempt, wait)
            await asyncio.sleep(wait)
    raise RuntimeError("unreachable")


class Output:
    def __init__(self, directory: Path, commit: Callable[[], Awaitable[None]]) -> None:
        self.dir = directory
        self.dir.mkdir(parents=True, exist_ok=True)
        self._commit = commit
        self._last_commit = 0.0
        self.results: dict[str, Any] = {}

    def append(self, name: str, row: dict[str, Any]) -> None:
        with open(self.dir / name, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    def write_json(self, name: str, value: Any) -> None:
        (self.dir / name).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")

    async def commit(self, force: bool = False) -> None:
        """Makes files visible outside the container; throttled to every 30 s unless forced."""
        if force or time.monotonic() - self._last_commit > 30:
            self._last_commit = time.monotonic()
            for handler in logging.getLogger().handlers:
                handler.flush()
            await self._commit()


def setup_logging(path: Path) -> None:
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for handler in (logging.FileHandler(path, encoding="utf-8"), logging.StreamHandler()):
        handler.setFormatter(formatter)
        root.addHandler(handler)
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# ============================================================================================================
# Speech
# ============================================================================================================


def load_clips(data_dir: Path) -> list[dict[str, Any]]:
    clips: list[dict[str, Any]] = []
    with open(data_dir / "primary_collection" / "metadata.csv", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            pair = row["language_pair"]
            clips.append(
                {
                    "dataset": "primary",
                    "path": data_dir / "primary_collection" / row["filename"],
                    "filename": row["filename"],
                    "reference": row["reference_transcript"],
                    "language_pair": pair,
                    "default_lang": "en" if pair == "English" else "mixed",
                    # Same as Songa: Kiswahili has no language hint, English gets "en".
                    "language_hint": "en" if pair == "English" else None,
                    "group": row.get("recording_type") or "unknown",
                    "accent": row.get("accent_country") or "",
                    "device": row.get("device_type") or "",
                    "domain": row.get("domain") or "",
                    "strip_spoken_punctuation": False,
                }
            )
    with open(data_dir / "samples" / "metadata.csv", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            clips.append(
                {
                    "dataset": "afrispeech",
                    "path": data_dir / "samples" / row["filename"],
                    "filename": row["filename"],
                    "reference": row["reference_transcript"],
                    "language_pair": row["language_pair"],
                    "default_lang": "en",  # AfriSpeech is accented English read aloud
                    "language_hint": "en",
                    "group": row.get("domain") or "",
                    "accent": row.get("accent_country") or "",
                    "device": row.get("device_type") or "",
                    "domain": row.get("domain") or "",
                    "strip_spoken_punctuation": True,
                }
            )
    return clips


async def run_asr(out: Output, data_dir: Path, limit: int) -> dict[str, Any]:
    import jiwer

    from evals.asr_metrics import WordTagger, aggregate, bootstrap_ci, normalize, score_clip
    from songa.config import Settings
    from songa.services.meta_api import MetaApiClient
    from songa.services.meta_transcriber import MetaVoiceTranscriber

    settings = Settings.from_env()
    stt = MetaVoiceTranscriber(
        MetaApiClient(api_key=settings.meta_api_key, base_url=settings.meta_api_base_url, timeout_s=120),
        model=settings.transcribe_model_id,
    )
    tagger = WordTagger()
    clips = load_clips(data_dir)
    if limit:
        clips = clips[:limit]
    logger.info("ASR: %d clips with human-verified references (%s)", len(clips), settings.transcribe_model_id)

    gate = asyncio.Semaphore(3)
    scored: list[tuple[dict[str, Any], Any]] = []

    async def one(clip: dict[str, Any]) -> None:
        audio = clip["path"].read_bytes()
        error = None
        hypothesis = ""
        async with gate:  # the clock starts after queueing, so latency is the request itself
            started = time.perf_counter()
            try:
                transcript = await with_retries(
                    lambda: stt.transcribe(audio, clip["language_hint"]), what=f"transcribe {clip['filename']}"
                )
                hypothesis = transcript.text
            except Exception as exc:  # noqa: BLE001
                error = f"{type(exc).__name__}: {exc}"
                logger.error("ASR %s failed: %s", clip["filename"], error)
            latency_ms = round((time.perf_counter() - started) * 1000, 1)

        ref_norm = normalize(clip["reference"])
        hyp_norm = normalize(
            hypothesis, strip_spoken_punctuation=clip["strip_spoken_punctuation"], reference=clip["reference"]
        )
        row: dict[str, Any] = {
            key: clip[key] for key in ("dataset", "filename", "language_pair", "group", "accent", "device", "domain", "language_hint")
        }
        row.update(
            {
                "latency_ms": latency_ms,
                "reference": clip["reference"],
                "hypothesis": hypothesis,
                "reference_normalized": ref_norm,
                "hypothesis_normalized": hyp_norm,
                "error": error,
            }
        )
        if error is None:
            scores = score_clip(ref_norm, hyp_norm, tagger=tagger, default_lang=clip["default_lang"])
            raw_errors = jiwer.process_words(clip["reference"].lower(), hypothesis.lower() or "")
            row.update(
                {
                    "wer": round(scores.wer, 4),
                    "cer": round(scores.cer, 4),
                    "wer_unnormalized": round(raw_errors.wer, 4),
                    **{k: v for k, v in aggregate([scores]).items() if k not in ("clips", "wer", "cer")},
                    "substitutions": [{"reference": r, "transcript": h, "language": lang} for r, h, lang in scores.substitutions],
                }
            )
            scored.append((clip | {"latency_ms": latency_ms}, scores))
        out.append("asr_per_clip.jsonl", row)
        logger.info("ASR %-52s %6.0f ms  WER %s", clip["filename"], latency_ms, row.get("wer", "FAILED"))
        await out.commit()

    await asyncio.gather(*(one(clip) for clip in clips))

    def summarise(subset: list[tuple[dict[str, Any], Any]], with_ci: bool = True) -> dict[str, Any]:
        items = [scores for _, scores in subset]
        summary: dict[str, Any] = aggregate(items)
        latencies = [clip["latency_ms"] for clip, _ in subset]
        summary["latency_p50_ms"] = round(float(np.percentile(latencies, 50)), 1) if latencies else None
        summary["latency_p95_ms"] = round(float(np.percentile(latencies, 95)), 1) if latencies else None
        if with_ci and len(items) >= 5:
            summary["ci95"] = {
                metric: bootstrap_ci(items, metric)
                for metric in ("wer", "cer", "swahili_recall_strict", "swahili_recall_lenient", "english_recall_strict")
                if summary.get(metric) is not None
            }
        return summary

    def by(key: str, subset: list[tuple[dict[str, Any], Any]]) -> dict[str, Any]:
        values = sorted({clip[key] for clip, _ in subset})
        return {value: summarise([pair for pair in subset if pair[0][key] == value], with_ci=False) for value in values}

    primary = [pair for pair in scored if pair[0]["dataset"] == "primary"]
    afrispeech = [pair for pair in scored if pair[0]["dataset"] == "afrispeech"]
    return {
        "model": settings.transcribe_model_id,
        "clips_total": len(clips),
        "clips_failed": len(clips) - len(scored),
        "primary": {
            "overall": summarise(primary),
            "code_switched_only": summarise([p for p in primary if p[0]["language_pair"] == "Swahili-English"]),
            "by_language_pair": by("language_pair", primary),
            "by_recording_type": by("group", primary),
        },
        "afrispeech": {
            "overall": summarise(afrispeech),
            "by_accent": by("accent", afrispeech),
            "by_domain": by("domain", afrispeech),
        },
    }


# ============================================================================================================
# Segmentation
# ============================================================================================================


async def prepare_coco(volume_dir: Path, out: Output) -> Path:
    """Downloads COCO val2017 instance annotations once into the Volume."""
    import zipfile

    import httpx

    coco_dir = volume_dir / "coco"
    coco_dir.mkdir(parents=True, exist_ok=True)
    annotations = coco_dir / "instances_val2017.json"
    if annotations.exists():
        return annotations
    url = "http://images.cocodataset.org/annotations/annotations_trainval2017.zip"
    archive = Path("/tmp/annotations_trainval2017.zip")
    logger.info("Downloading COCO annotations (~240 MB) from %s", url)
    async with httpx.AsyncClient(timeout=httpx.Timeout(600, connect=30), follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            with open(archive, "wb") as handle:
                async for chunk in response.aiter_bytes(1 << 20):
                    handle.write(chunk)
    with zipfile.ZipFile(archive) as bundle:
        annotations.write_bytes(bundle.read("annotations/instances_val2017.json"))
    archive.unlink(missing_ok=True)
    await out.commit(force=True)
    return annotations


async def fetch_images(coco: Any, image_ids: list[int], volume_dir: Path) -> dict[int, bytes]:
    import httpx

    folder = volume_dir / "coco" / "val2017"
    folder.mkdir(parents=True, exist_ok=True)
    gate = asyncio.Semaphore(16)
    images: dict[int, bytes] = {}

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:

        async def one(image_id: int) -> None:
            info = coco.loadImgs([image_id])[0]
            path = folder / info["file_name"]
            if not path.exists():
                async with gate:
                    response = await with_retries(lambda: client.get(info["coco_url"]), what=f"image {image_id}")
                response.raise_for_status()
                path.write_bytes(response.content)
            images[image_id] = path.read_bytes()

        await asyncio.gather(*(one(image_id) for image_id in image_ids))
    return images


#: Same overlap cut-off as Songa's `refine_segments`, so counts reflect what the app would draw.
NMS_IOU = 0.6


def suppress_duplicates(found: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Greedy non-maximum suppression on boxes, highest score first."""
    from songa.vision.geometry import Box, iou

    kept: list[dict[str, Any]] = []
    for item in sorted(found, key=lambda f: f["score"], reverse=True):
        box = Box(*item["bbox"])
        if all(iou(box, Box(*other["bbox"])) < NMS_IOU for other in kept):
            kept.append(item)
    return kept


def _full_mask(local_bits: bytes, box: tuple[int, int, int, int], height: int, width: int) -> np.ndarray:
    from songa.services.sam_local import unpack_local_mask

    x, y, w, h = box
    mask = np.zeros((height, width), dtype=bool)
    if w > 0 and h > 0:
        mask[y : y + h, x : x + w] = unpack_local_mask(local_bits, w, h)
    return mask


class MetaBackend:
    """Hosted SAM 3.1 through Songa's Meta adapter, keeping masks and every score (no threshold)."""

    name = "meta_api_sam3.1"

    def __init__(self) -> None:
        from songa.config import Settings
        from songa.services.meta_api import MetaApiClient
        from songa.services.meta_sam import MetaSamSegmenter

        settings = Settings.from_env()
        client = MetaApiClient(api_key=settings.meta_api_key, base_url=settings.meta_api_base_url, timeout_s=120)
        self.model = settings.sam_model_id
        self.segmenter = MetaSamSegmenter(client, model=settings.sam_model_id, score_threshold=0.0)

    async def detect(self, jpeg: bytes, text: str, height: int, width: int) -> list[dict[str, Any]]:
        from songa.core.media import to_data_url
        from songa.services.meta_sam import mask_to_frame, parse_segmentation
        from songa.vision.geometry import xyxy_to_box

        reply = await self.segmenter._segment_text(  # noqa: SLF001 - evaluation needs masks the app discards
            text, to_data_url(jpeg), {"include_confidence": "true", "mask_encoding": "one_bit"}
        )
        boxes, masks = await parse_segmentation(reply)
        found = []
        for record in boxes:
            box = xyxy_to_box(record.left, record.top, record.right, record.bottom, width, height)
            if box.area == 0:
                continue
            mask_record = masks.get(record.object_id)
            if mask_record is not None:
                mask = mask_to_frame(mask_record, width, height)
            else:
                mask = np.zeros((height, width), dtype=bool)
                mask[box.y : box.y + box.height, box.x : box.x + box.width] = True
            score = 1.0 if record.confidence is None else float(record.confidence)
            found.append({"score": score, "bbox": [box.x, box.y, box.width, box.height], "mask": mask})
        return found

    async def tap(self, jpeg: bytes, x: int, y: int, height: int, width: int) -> np.ndarray | None:
        from songa.core.media import to_data_url
        from songa.services.meta_sam import mask_to_frame, parse_segmentation, point_prompt

        reply = await self.segmenter._segment_text(  # noqa: SLF001
            point_prompt(x, y, width, height), to_data_url(jpeg), {"include_confidence": "true"}
        )
        _, masks = await parse_segmentation(reply)
        record = masks.get("1") or next(iter(masks.values()), None)
        return None if record is None else mask_to_frame(record, width, height)


class GpuBackend:
    """Songa's SAM 3 (`Sam3Runner`) on a Modal L4, the same code as the production `SamGpu` class."""

    name = "modal_gpu_sam3"

    def __init__(self, handle: Any) -> None:
        self.handle = handle
        self.model = "facebook/sam3 (transformers)"

    async def detect_all(self, jpeg: bytes, texts: list[str], height: int, width: int) -> dict[str, list[dict[str, Any]]]:
        items = await self.handle.segment.remote.aio(jpeg, texts, 0.05)
        found: dict[str, list[dict[str, Any]]] = {text: [] for text in texts}
        for item in items:
            box = (int(item["x"]), int(item["y"]), int(item["width"]), int(item["height"]))
            found[item["label"]].append(
                {"score": float(item["score"]), "bbox": list(box), "mask": _full_mask(item["mask_bits"], box, height, width)}
            )
        return found

    async def tap(self, jpeg: bytes, x: int, y: int, height: int, width: int) -> np.ndarray | None:
        result = await self.handle.isolate.remote.aio(jpeg, x, y)
        if result.get("empty"):
            return None
        box = (int(result["x"]), int(result["y"]), int(result["width"]), int(result["height"]))
        return _full_mask(result["mask_bits"], box, height, width)


async def run_seg(out: Output, volume_dir: Path, images: int, seed: int, gpu_handle: Any) -> dict[str, Any]:
    from pycocotools.coco import COCO

    from evals.seg_eval import (
        PRESENCE_THRESHOLD,
        coco_ap,
        encode_rle,
        latency_summary,
        mask_iou,
        presence_metrics,
        sample_coco,
        tap_metrics,
    )
    from songa.core.media import encode_jpeg, open_rgb_image

    annotations = await prepare_coco(volume_dir, out)
    coco = COCO(str(annotations))
    image_ids, prompts, taps = sample_coco(coco, images=images, seed=seed)
    logger.info("SEG: %d images, %d prompts (%d absent), %d taps", len(image_ids), len(prompts),
                sum(not p.present for p in prompts), len(taps))
    raw_images = await fetch_images(coco, image_ids, volume_dir)
    await out.commit(force=True)

    # Identical JPEG bytes go to both backends, at COCO's own resolution so coordinates match the annotations.
    jpegs = {image_id: encode_jpeg(open_rgb_image(raw), quality=90) for image_id, raw in raw_images.items()}
    sizes = {image_id: (info["height"], info["width"]) for image_id, info in ((i, coco.loadImgs([i])[0]) for i in image_ids)}
    prompts_by_image: dict[int, list[Any]] = {}
    for prompt in prompts:
        prompts_by_image.setdefault(prompt.image_id, []).append(prompt)

    meta = MetaBackend()
    gpu = GpuBackend(gpu_handle)
    results: dict[str, Any] = {
        "dataset": "COCO val2017 (instances), sampled",
        "images": len(image_ids),
        "prompts": len(prompts),
        "absent_prompts": sum(not p.present for p in prompts),
        "taps": len(taps),
        "presence_threshold": PRESENCE_THRESHOLD,
        "backends": {},
    }

    # Boot the GPU and load weights before timing anything, so latency reflects a warm container.
    logger.info("SEG: warming up the GPU (cold start is not timed)")
    first = image_ids[0]
    await with_retries(lambda: gpu.detect_all(jpegs[first], ["object"], *sizes[first]), what="gpu warm-up", attempts=3)

    for backend in (gpu, meta):
        logger.info("SEG backend %s: starting", backend.name)
        detections: list[dict[str, Any]] = []
        prompt_rows: list[dict[str, Any]] = []
        image_latencies: list[float] = []
        gate = asyncio.Semaphore(4)

        async def run_image(image_id: int) -> None:
            height, width = sizes[image_id]
            image_prompts = prompts_by_image[image_id]
            texts = [p.text for p in image_prompts]
            started = time.perf_counter()
            per_text: dict[str, list[dict[str, Any]]] = {}
            errors: dict[str, str] = {}
            if isinstance(backend, GpuBackend):
                try:
                    per_text = await with_retries(
                        lambda: backend.detect_all(jpegs[image_id], texts, height, width), what=f"gpu image {image_id}"
                    )
                except Exception as exc:  # noqa: BLE001
                    errors = {text: f"{type(exc).__name__}: {exc}" for text in texts}
            else:

                async def one(text: str) -> None:
                    try:
                        async with gate:
                            per_text[text] = await with_retries(
                                lambda: backend.detect(jpegs[image_id], text, height, width), what=f"meta {image_id} {text}"
                            )
                    except Exception as exc:  # noqa: BLE001
                        errors[text] = f"{type(exc).__name__}: {exc}"

                await asyncio.gather(*(one(text) for text in texts))  # concurrent, like Songa's Look
            image_latencies.append((time.perf_counter() - started) * 1000)

            for prompt in image_prompts:
                found = suppress_duplicates(per_text.get(prompt.text, []))
                for item in found:
                    detections.append(
                        {
                            "image_id": image_id,
                            "category_id": prompt.category_id,
                            "bbox": item["bbox"],
                            "score": item["score"],
                            "segmentation": encode_rle(item["mask"]),
                        }
                    )
                row = {
                    "backend": backend.name,
                    "image_id": image_id,
                    "prompt": prompt.text,
                    "present": prompt.present,
                    "gt_instances": prompt.gt_instances,
                    "detections": len(found),
                    "detections_at_threshold": sum(1 for f in found if f["score"] >= PRESENCE_THRESHOLD),
                    "max_score": round(max((f["score"] for f in found), default=0.0), 4),
                    "error": errors.get(prompt.text),
                }
                prompt_rows.append(row)
                out.append("seg_prompts.jsonl", row)

        for index, image_id in enumerate(image_ids, 1):
            await run_image(image_id)
            if index % 20 == 0 or index == len(image_ids):
                logger.info("SEG %s: %d/%d images", backend.name, index, len(image_ids))
                await out.commit()

        tap_rows: list[dict[str, Any]] = []
        tap_latencies: list[float] = []

        async def run_tap(tap: Any) -> None:
            height, width = sizes[tap.image_id]
            row: dict[str, Any] = {"backend": backend.name, "image_id": tap.image_id, "category": tap.category,
                                   "x": tap.x, "y": tap.y, "iou": None, "error": None}
            mask = None
            async with gate:  # timed after queueing
                started = time.perf_counter()
                try:
                    mask = await with_retries(
                        lambda: backend.tap(jpegs[tap.image_id], tap.x, tap.y, height, width), what=f"tap {tap.image_id}"
                    )
                except Exception as exc:  # noqa: BLE001
                    row["error"] = f"{type(exc).__name__}: {exc}"
                latency = (time.perf_counter() - started) * 1000
            if row["error"] is None:
                truth = coco.annToMask(coco.loadAnns([tap.annotation_id])[0]).astype(bool)
                row["iou"] = round(mask_iou(mask, truth), 4) if mask is not None else 0.0
            tap_latencies.append(latency)
            row["latency_ms"] = round(latency, 1)
            tap_rows.append(row)
            out.append("seg_taps.jsonl", row)

        await asyncio.gather(*(run_tap(tap) for tap in taps))
        logger.info("SEG %s: %d taps done", backend.name, len(tap_rows))

        (out.dir / f"seg_detections_{backend.name}.json").write_text(json.dumps(detections), encoding="utf-8")
        results["backends"][backend.name] = {
            "model": backend.model,
            "presence": presence_metrics(prompt_rows),
            "box_ap": coco_ap(coco, detections, image_ids, "bbox"),
            "mask_ap": coco_ap(coco, detections, image_ids, "segm"),
            "tap_to_isolate": tap_metrics(tap_rows),
            "latency_per_photo": latency_summary(image_latencies),
            "latency_per_tap": latency_summary(tap_latencies),
        }
        logger.info("SEG %s: %s", backend.name, json.dumps(results["backends"][backend.name]))
        out.results["segmentation"] = results
        out.write_json("results.json", out.results)
        await out.commit(force=True)
    return results


# ============================================================================================================
# Report
# ============================================================================================================


def _pct(value: Any) -> str:
    return "–" if value is None else f"{value * 100:.1f}%"


def _ci(summary: dict[str, Any], metric: str) -> str:
    interval = (summary.get("ci95") or {}).get(metric)
    return f" ({interval[0] * 100:.1f}–{interval[1] * 100:.1f})" if interval else ""


def write_summary(out: Output, config: dict[str, Any]) -> None:
    lines = [f"# Songa evaluation run `{config['run_id']}`", "", f"Started {config['started_utc']} UTC. Parts: {', '.join(config['parts'])}.", ""]
    asr = out.results.get("asr")
    if asr:
        lines += [
            f"## Speech: {asr['model']}",
            "",
            f"{asr['clips_total']} clips with human-verified references; {asr['clips_failed']} failed. "
            "Rates are pooled over all words; brackets are 95% bootstrap confidence intervals over clips.",
            "",
            "| Set | Clips | WER | CER | Swahili recall (strict) | Swahili recall (lenient) | Swahili→English | English recall | Error near switches | p50 latency |",
            "|---|---|---|---|---|---|---|---|---|---|",
        ]
        rows = [("Your recordings (all)", asr["primary"]["overall"]), ("Code-switched only", asr["primary"]["code_switched_only"])]
        rows += [(f"  {k}", v) for k, v in asr["primary"]["by_language_pair"].items()]
        rows += [("AfriSpeech (accented English)", asr["afrispeech"]["overall"])]
        for label, s in rows:
            lines.append(
                f"| {label} | {s['clips']} | {_pct(s['wer'])}{_ci(s, 'wer')} | {_pct(s['cer'])}{_ci(s, 'cer')} | "
                f"{_pct(s['swahili_recall_strict'])}{_ci(s, 'swahili_recall_strict')} | "
                f"{_pct(s['swahili_recall_lenient'])}{_ci(s, 'swahili_recall_lenient')} | {_pct(s['swahili_to_english_rate'])} | "
                f"{_pct(s['english_recall_strict'])} | {_pct(s['switch_window_error_rate'])} | {s['latency_p50_ms']} ms |"
            )
        lines += ["", "AfriSpeech by accent:", "", "| Accent | Clips | WER | CER |", "|---|---|---|---|"]
        for accent, s in asr["afrispeech"]["by_accent"].items():
            lines.append(f"| {accent} | {s['clips']} | {_pct(s['wer'])} | {_pct(s['cer'])} |")
        lines.append("")
    seg = out.results.get("segmentation")
    if seg and seg.get("backends"):
        lines += [
            "## Segmentation: COCO val2017 sample",
            "",
            f"{seg['images']} images, {seg['prompts']} text prompts ({seg['absent_prompts']} for objects not in the image), "
            f"{seg['taps']} taps. Presence uses Songa's threshold ({seg['presence_threshold']}).",
            "",
            "| Backend | False detections on absent objects | Presence precision | Presence recall | Box AP | Box AP50 | Mask AP | Tap mean IoU | Taps IoU≥0.5 | p50 per photo | p50 per tap |",
            "|---|---|---|---|---|---|---|---|---|---|---|",
        ]
        for name, b in seg["backends"].items():
            p, t = b["presence"], b["tap_to_isolate"]
            lines.append(
                f"| {name} | {_pct(p['false_positive_rate_on_absent_objects'])} | {_pct(p['precision'])} | {_pct(p['recall'])} | "
                f"{b['box_ap']['AP']:.3f} | {b['box_ap']['AP50']:.3f} | {b['mask_ap']['AP']:.3f} | "
                f"{t['mean_iou'] if t['mean_iou'] is not None else '–'} | {_pct(t['share_iou_at_least_0.5'])} | "
                f"{b['latency_per_photo']['p50_ms']} ms | {b['latency_per_tap']['p50_ms']} ms |"
            )
        lines.append("")
    lines += [
        "## Notes",
        "",
        "- Swahili/English word tags come from English word frequencies plus a list of common Swahili words; borrowed words can be misclassified.",
        "- AfriSpeech readers say punctuation aloud (\"comma\", \"full stop\"); those words are removed from transcripts when the reference does not contain them.",
        "- COCO uses simple object names, so absolute segmentation scores are optimistic for travel scenes; compare the two backends.",
        "- Meta SAM latency includes the network from Modal to the Meta API; the GPU latency includes Modal's call overhead.",
    ]
    (out.dir / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


async def run(
    *,
    run_id: str,
    parts: set[str],
    images: int,
    limit: int,
    seed: int,
    data_dir: Path,
    volume_dir: Path,
    commit: Callable[[], Awaitable[None]],
    gpu: Any,
) -> str:
    from datetime import datetime, timezone

    out = Output(volume_dir / "results" / run_id, commit)
    setup_logging(out.dir / "run.log")
    config = {
        "run_id": run_id,
        "started_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "parts": sorted(parts),
        "images": images,
        "limit": limit,
        "seed": seed,
        "data": {
            "primary_clips": sum(1 for _ in open(data_dir / "primary_collection" / "metadata.csv", encoding="utf-8")) - 1,
            "afrispeech_clips": sum(1 for _ in open(data_dir / "samples" / "metadata.csv", encoding="utf-8")) - 1,
            "reference_policy": "human-verified only; clips with bootstrapped references were removed",
        },
    }
    out.write_json("config.json", config)
    logger.info("Run %s started: %s", run_id, json.dumps(config))
    await out.commit(force=True)
    started = time.perf_counter()

    try:
        if "asr" in parts:
            out.results["asr"] = await run_asr(out, data_dir, limit)
            out.write_json("results.json", out.results)
            write_summary(out, config)
            logger.info("ASR done: %s", json.dumps(out.results["asr"]["primary"]["overall"]))
            await out.commit(force=True)
        if "seg" in parts:
            try:
                await run_seg(out, volume_dir, limit or images, seed, gpu)
            except Exception:
                # Speech results are already saved; record the failure instead of losing the whole run.
                logger.exception("Segmentation stage failed")
                out.results.setdefault("segmentation", {})["error"] = "failed; see run.log"
    except Exception:
        logger.exception("Run %s stopped with an error; partial results are saved", run_id)
        raise
    finally:
        out.results["elapsed_minutes"] = round((time.perf_counter() - started) / 60, 1)
        out.write_json("results.json", out.results)
        write_summary(out, config)
        logger.info("Run %s finished in %.1f min", run_id, out.results["elapsed_minutes"])
        await out.commit(force=True)
    return f"Run {run_id} complete. Results in songa-eval:/results/{run_id}/"
