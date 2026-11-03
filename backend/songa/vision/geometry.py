"""Pure mask and box math shared by the SAM service and the gateway. No model imports."""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from songa.core.media import downscale, encode_jpeg
from songa.engines import RawSegment

# Open-vocabulary concept prompts for SAM 3.1 per scene type.
SCENE_CONCEPTS: dict[str, list[str]] = {
    "menu": ["menu item", "dish photo", "price"],
    "signage": ["sign", "text", "arrow", "timetable"],
    "market": ["product", "food", "price tag"],
    "general": ["sign", "text", "food", "product"],
}

OUTLINE_RGB = (11, 132, 87)


@dataclass(frozen=True)
class Box:
    x: int
    y: int
    width: int
    height: int

    @property
    def area(self) -> int:
        return max(self.width, 0) * max(self.height, 0)

    def contains(self, px: int, py: int) -> bool:
        return self.x <= px <= self.x + self.width and self.y <= py <= self.y + self.height


def xyxy_to_box(x1: float, y1: float, x2: float, y2: float, image_w: int, image_h: int) -> Box:
    left = int(np.clip(np.floor(min(x1, x2)), 0, image_w))
    top = int(np.clip(np.floor(min(y1, y2)), 0, image_h))
    right = int(np.clip(np.ceil(max(x1, x2)), 0, image_w))
    bottom = int(np.clip(np.ceil(max(y1, y2)), 0, image_h))
    return Box(left, top, right - left, bottom - top)


def mask_to_box(mask: np.ndarray) -> Box | None:
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        return None
    x1, x2 = int(xs.min()), int(xs.max())
    y1, y2 = int(ys.min()), int(ys.max())
    return Box(x1, y1, x2 - x1 + 1, y2 - y1 + 1)


def iou(a: Box, b: Box) -> float:
    ix = max(0, min(a.x + a.width, b.x + b.width) - max(a.x, b.x))
    iy = max(0, min(a.y + a.height, b.y + b.height) - max(a.y, b.y))
    intersection = ix * iy
    union = a.area + b.area - intersection
    return intersection / union if union > 0 else 0.0


def refine_segments(
    segments: list[RawSegment],
    *,
    image_w: int,
    image_h: int,
    min_area_ratio: float = 0.0015,
    max_area_ratio: float = 0.9,
    iou_threshold: float = 0.6,
    max_count: int = 40,
) -> list[RawSegment]:
    """Drops specks and near-full-frame boxes, then applies greedy non-maximum suppression across concepts."""
    image_area = max(image_w * image_h, 1)
    candidates = [
        s
        for s in segments
        if min_area_ratio <= (s.width * s.height) / image_area <= max_area_ratio and s.width > 1 and s.height > 1
    ]
    candidates.sort(key=lambda s: s.score, reverse=True)

    kept: list[RawSegment] = []
    kept_boxes: list[Box] = []
    for segment in candidates:
        box = Box(segment.x, segment.y, segment.width, segment.height)
        if all(iou(box, other) < iou_threshold for other in kept_boxes):
            kept.append(segment)
            kept_boxes.append(box)
        if len(kept) >= max_count:
            break
    return kept


def choose_mask(masks: np.ndarray, scores: np.ndarray, click_x: int, click_y: int) -> int:
    """Index of the highest-scoring mask covering the click, falling back to the best mask overall."""
    covering = [i for i in range(masks.shape[0]) if masks[i, click_y, click_x]]
    pool = covering or list(range(masks.shape[0]))
    return max(pool, key=lambda i: float(scores[i]))


def pad_box(box: Box, *, image_w: int, image_h: int, ratio: float = 0.12, min_size: int = 64) -> Box:
    pad_x = max(int(box.width * ratio), (min_size - box.width) // 2, 0)
    pad_y = max(int(box.height * ratio), (min_size - box.height) // 2, 0)
    left = max(box.x - pad_x, 0)
    top = max(box.y - pad_y, 0)
    right = min(box.x + box.width + pad_x, image_w)
    bottom = min(box.y + box.height + pad_y, image_h)
    return Box(left, top, right - left, bottom - top)


def render_isolated_crop(image: Image.Image, mask: np.ndarray, box: Box, *, fade: float = 0.55) -> bytes:
    """Crops the padded box and fades pixels outside the mask so the model focuses on the tapped item."""
    padded = pad_box(box, image_w=image.width, image_h=image.height)
    region = np.asarray(image.crop((padded.x, padded.y, padded.x + padded.width, padded.y + padded.height)), dtype=np.float32)
    region_mask = mask[padded.y : padded.y + padded.height, padded.x : padded.x + padded.width]
    faded = region * (1 - fade) + 255.0 * fade
    composed = np.where(region_mask[..., None], region, faded).astype(np.uint8)
    crop = Image.fromarray(composed)
    return encode_jpeg(downscale(crop, 1024), quality=90)


def render_numbered_marks(image: Image.Image, boxes: list[Box], *, max_edge: int = 1536) -> bytes:
    """Outlines each box and tags it with its 1-based number so the model can refer to items by number."""
    marked = downscale(image, max_edge).copy()
    scale = marked.width / image.width
    draw = ImageDraw.Draw(marked)
    stroke = max(2, round(max(marked.size) / 300))
    font_size = max(16, round(max(marked.size) / 32))
    font = ImageFont.load_default(size=font_size)
    for number, box in enumerate(boxes, start=1):
        left, top = int(box.x * scale), int(box.y * scale)
        right, bottom = int((box.x + box.width) * scale), int((box.y + box.height) * scale)
        draw.rectangle((left, top, right, bottom), outline=OUTLINE_RGB, width=stroke)
        label = str(number)
        text_left, text_top, text_right, text_bottom = draw.textbbox((0, 0), label, font=font)
        pad = max(2, font_size // 5)
        tag_w, tag_h = text_right - text_left + 2 * pad, text_bottom - text_top + 2 * pad
        tag_x, tag_y = left, max(top - tag_h, 0)
        draw.rectangle((tag_x, tag_y, tag_x + tag_w, tag_y + tag_h), fill=OUTLINE_RGB)
        draw.text((tag_x + pad - text_left, tag_y + pad - text_top), label, fill=(255, 255, 255), font=font)
    return encode_jpeg(marked, quality=85)


def render_context(image: Image.Image, box: Box, *, max_edge: int = 768) -> bytes:
    """Downscaled full scene with the tapped item outlined."""
    context = downscale(image, max_edge)
    scale = context.width / image.width
    scaled = replace(
        box,
        x=int(box.x * scale),
        y=int(box.y * scale),
        width=max(int(box.width * scale), 2),
        height=max(int(box.height * scale), 2),
    )
    draw = ImageDraw.Draw(context)
    stroke = max(2, round(max(context.size) / 200))
    draw.rectangle((scaled.x, scaled.y, scaled.x + scaled.width, scaled.y + scaled.height), outline=OUTLINE_RGB, width=stroke)
    return encode_jpeg(context, quality=80)
