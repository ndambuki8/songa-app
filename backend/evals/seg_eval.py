"""COCO val2017 sample for comparing SAM backends on four questions:

* Presence: does it report an object only when one is there? Every image is prompted with each category it
  contains plus categories it does not contain.
* Detection: are the boxes right? COCO box AP.
* Segmentation: are the outlines right? COCO mask AP.
* Tap-to-isolate: does a tap select the right object? Mask IoU for a point inside a known object.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any

import numpy as np

#: Songa's production SAM_SCORE_THRESHOLD: detections at or above this are shown to the traveler.
PRESENCE_THRESHOLD = 0.35
ABSENT_PROMPTS_PER_IMAGE = 2
TAPS_PER_IMAGE = 2
MIN_TAP_AREA = 32 * 32


@dataclass(frozen=True)
class Prompt:
    image_id: int
    category_id: int
    text: str
    present: bool
    gt_instances: int


@dataclass(frozen=True)
class Tap:
    image_id: int
    annotation_id: int
    category: str
    x: int
    y: int


def sample_coco(coco: Any, *, images: int, seed: int) -> tuple[list[int], list[Prompt], list[Tap]]:
    """Images with at least one non-crowd object, their prompts and tap targets. Deterministic for a seed."""
    rng = random.Random(seed)
    candidates = sorted(
        image_id for image_id in coco.getImgIds() if coco.getAnnIds(imgIds=[image_id], iscrowd=False)
    )
    chosen = sorted(rng.sample(candidates, min(images, len(candidates))))
    names = {category["id"]: category["name"] for category in coco.loadCats(coco.getCatIds())}
    all_categories = sorted(names)

    prompts: list[Prompt] = []
    taps: list[Tap] = []
    for image_id in chosen:
        annotations = coco.loadAnns(coco.getAnnIds(imgIds=[image_id]))
        counts: dict[int, int] = {}
        for annotation in annotations:
            if not annotation.get("iscrowd"):
                counts[annotation["category_id"]] = counts.get(annotation["category_id"], 0) + 1
        present = {annotation["category_id"] for annotation in annotations}
        for category_id in sorted(present):
            prompts.append(Prompt(image_id, category_id, names[category_id], True, counts.get(category_id, 0)))
        absent = [category_id for category_id in all_categories if category_id not in present]
        for category_id in rng.sample(absent, ABSENT_PROMPTS_PER_IMAGE):
            prompts.append(Prompt(image_id, category_id, names[category_id], False, 0))

        tappable = [a for a in annotations if not a.get("iscrowd") and a["area"] >= MIN_TAP_AREA]
        for annotation in rng.sample(tappable, min(TAPS_PER_IMAGE, len(tappable))):
            x, y = interior_point(coco.annToMask(annotation).astype(bool))
            taps.append(Tap(image_id, annotation["id"], names[annotation["category_id"]], x, y))
    return chosen, prompts, taps


def interior_point(mask: np.ndarray) -> tuple[int, int]:
    """The pixel deepest inside the mask, so the tap lands clearly on the object rather than its edge."""
    from scipy.ndimage import distance_transform_edt

    distance = distance_transform_edt(mask)
    y, x = np.unravel_index(int(np.argmax(distance)), distance.shape)
    return int(x), int(y)


def mask_iou(a: np.ndarray, b: np.ndarray) -> float:
    union = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / union) if union else 0.0


def encode_rle(mask: np.ndarray) -> dict[str, Any]:
    from pycocotools import mask as mask_utils

    rle = mask_utils.encode(np.asfortranarray(mask.astype(np.uint8)))
    rle["counts"] = rle["counts"].decode("ascii")
    return rle


def coco_ap(coco: Any, detections: list[dict[str, Any]], image_ids: list[int], kind: str) -> dict[str, float]:
    """Standard COCO AP over the sampled images. `kind` is "bbox" or "segm"."""
    import contextlib
    import io

    from pycocotools.cocoeval import COCOeval

    if not detections:
        return {"AP": 0.0, "AP50": 0.0, "AP75": 0.0, "AR100": 0.0}
    # loadRes derives area (and, for masks, the box) from whichever field it is given, so each kind gets only
    # its own field; it also mutates the dicts, hence the copies.
    drop = "segmentation" if kind == "bbox" else "bbox"
    prepared = [{k: v for k, v in detection.items() if k != drop} for detection in detections]
    with contextlib.redirect_stdout(io.StringIO()):
        results = coco.loadRes(prepared)
        evaluator = COCOeval(coco, results, kind)
        evaluator.params.imgIds = image_ids
        evaluator.evaluate()
        evaluator.accumulate()
        evaluator.summarize()
    stats = evaluator.stats
    return {
        "AP": round(float(stats[0]), 4),
        "AP50": round(float(stats[1]), 4),
        "AP75": round(float(stats[2]), 4),
        "AR100": round(float(stats[8]), 4),
    }


def presence_metrics(rows: list[dict[str, Any]]) -> dict[str, float | int | None]:
    """Image-level presence at the production threshold, from per-prompt rows with `present` and `max_score`."""
    scored = [row for row in rows if row.get("error") is None]
    tp = sum(1 for r in scored if r["present"] and r["max_score"] >= PRESENCE_THRESHOLD)
    fn = sum(1 for r in scored if r["present"] and r["max_score"] < PRESENCE_THRESHOLD)
    fp = sum(1 for r in scored if not r["present"] and r["max_score"] >= PRESENCE_THRESHOLD)
    tn = sum(1 for r in scored if not r["present"] and r["max_score"] < PRESENCE_THRESHOLD)
    ratio = lambda a, b: round(a / b, 4) if b else None  # noqa: E731
    count_errors = [
        abs(r["detections_at_threshold"] - r["gt_instances"]) for r in scored if r["present"] and r["gt_instances"]
    ]
    return {
        "prompts": len(scored),
        "failed_prompts": len(rows) - len(scored),
        "precision": ratio(tp, tp + fp),
        "recall": ratio(tp, tp + fn),
        "accuracy": ratio(tp + tn, len(scored)),
        "false_positive_rate_on_absent_objects": ratio(fp, fp + tn),
        "mean_count_error_present": round(float(np.mean(count_errors)), 3) if count_errors else None,
    }


def tap_metrics(rows: list[dict[str, Any]]) -> dict[str, float | int | None]:
    scored = [row for row in rows if row.get("iou") is not None]
    ious = np.array([row["iou"] for row in scored]) if scored else np.array([])
    return {
        "taps": len(scored),
        "failed_taps": len(rows) - len(scored),
        "mean_iou": round(float(ious.mean()), 4) if len(ious) else None,
        "median_iou": round(float(np.median(ious)), 4) if len(ious) else None,
        "share_iou_at_least_0.5": round(float((ious >= 0.5).mean()), 4) if len(ious) else None,
        "share_iou_at_least_0.75": round(float((ious >= 0.75).mean()), 4) if len(ious) else None,
    }


def latency_summary(values_ms: list[float]) -> dict[str, float | None]:
    if not values_ms:
        return {"p50_ms": None, "p95_ms": None, "mean_ms": None}
    array = np.array(values_ms)
    return {
        "p50_ms": round(float(np.percentile(array, 50)), 1),
        "p95_ms": round(float(np.percentile(array, 95)), 1),
        "mean_ms": round(float(array.mean()), 1),
    }
