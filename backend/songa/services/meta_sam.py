"""Segmentation through hosted Meta SAM 3.1 on the Meta Model API Responses endpoint.

* Concept prompts ("menu item", "sign") find every matching instance. The API takes one concept per request,
  so concepts are sent concurrently.
* A point prompt (`<0f>1<|point;...|>`) segments the object under the traveler's tap.

Output is SAM's special-token text, read with Meta's `meta-sam-parser`. Masks are local to their box.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

import numpy as np
from meta_sam_parser import (
    InvalidSegmentationMaskError,
    ResponsesStreamError,
    SegmentationBoxRecord,
    SegmentationMaskRecord,
    decode_mask_to_raster,
    image_segmentation_format,
    parse_responses_stream,
)
from PIL import Image

from songa.core.errors import BadPayload, UnprocessableMedia, UpstreamModelError
from songa.core.media import encode_jpeg, open_rgb_image, to_data_url
from songa.engines import Isolation, RawSegment
from songa.services.meta_api import MetaApiClient
from songa.vision.geometry import mask_to_box, render_context, render_isolated_crop, xyxy_to_box

logger = logging.getLogger(__name__)

SERVICE = "SAM 3.1"
_LANE = {"item_id": "msg_songa", "output_index": 0, "content_index": 0}


def response_output_text(payload: Any) -> str:
    """Concatenates the output text of a non-streaming Responses API body."""
    if not isinstance(payload, dict):
        raise UpstreamModelError(f"{SERVICE} returned an unreadable response.")
    if payload.get("status") in ("failed", "cancelled"):
        raise UpstreamModelError(f"{SERVICE} could not segment the photo.")
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]

    parts: list[str] = []
    for item in payload.get("output") or []:
        for content in (item.get("content") or []) if isinstance(item, dict) else []:
            if not isinstance(content, dict):
                continue
            if content.get("type") == "refusal":
                raise UpstreamModelError(f"{SERVICE} declined to segment the photo.")
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                parts.append(content["text"])
    return "".join(parts)


async def _as_events(text: str) -> AsyncIterator[dict[str, Any]]:
    if text:
        yield {"type": "response.output_text.delta", **_LANE, "delta": text}
    yield {"type": "response.output_text.done", **_LANE, "text": text}
    yield {"type": "response.completed", "response": {"status": "completed"}}


async def parse_segmentation(text: str) -> tuple[list[SegmentationBoxRecord], dict[str, SegmentationMaskRecord]]:
    """Parses SAM output text into box records (source order) and the latest mask per object id."""
    try:
        result = await parse_responses_stream(_as_events(text), image_segmentation_format()).final_result()
    except ResponsesStreamError as exc:
        raise UpstreamModelError(f"{SERVICE} returned output that could not be parsed.") from exc
    for diagnostic in result.diagnostics:
        logger.warning("SAM output diagnostic: %s", diagnostic)

    boxes = [record for record in result.records if isinstance(record, SegmentationBoxRecord)]
    masks = {record.object_id: record for record in result.records if isinstance(record, SegmentationMaskRecord)}
    return boxes, masks


def point_prompt(x: int, y: int, width: int, height: int) -> str:
    return f"<0f>1<|point;x={x};y={y};w={width};h={height}|>"


def mask_to_frame(record: SegmentationMaskRecord, width: int, height: int) -> np.ndarray:
    """Places a box-local mask raster into a full-frame boolean mask, resizing it to the box if needed."""
    left = int(np.clip(record.bounds.left, 0, width))
    top = int(np.clip(record.bounds.top, 0, height))
    right = int(np.clip(record.bounds.right, left, width))
    bottom = int(np.clip(record.bounds.bottom, top, height))
    frame = np.zeros((height, width), dtype=bool)
    if right == left or bottom == top:
        return frame

    try:
        raster = np.frombuffer(decode_mask_to_raster(record.mask), dtype=np.uint8)
        local = raster.reshape(record.mask.height, record.mask.width)
    except (InvalidSegmentationMaskError, ValueError):
        logger.warning("Undecodable SAM mask for object %s; falling back to its box", record.object_id)
        frame[top:bottom, left:right] = True
        return frame

    box_w, box_h = right - left, bottom - top
    if local.shape != (box_h, box_w):
        resized = Image.fromarray(local * 255).resize((box_w, box_h), Image.Resampling.NEAREST)
        local = np.asarray(resized) > 127
    frame[top:bottom, left:right] = local > 0
    return frame


class MetaSamSegmenter:
    """`Segmenter` backed by hosted SAM 3.1."""

    def __init__(self, client: MetaApiClient, *, model: str, score_threshold: float, max_concurrency: int = 4) -> None:
        self._client = client
        self._model = model
        self._score_threshold = score_threshold
        self._limit = asyncio.Semaphore(max_concurrency)

    async def _segment_text(self, prompt: str, image_url: str, metadata: dict[str, str]) -> str:
        async with self._limit:
            payload = await self._client.post(
                "/responses",
                service=SERVICE,
                json={
                    "model": self._model,
                    "input": [
                        {
                            "type": "message",
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": prompt},
                                {"type": "input_image", "image_url": image_url},
                            ],
                        }
                    ],
                    "stream": False,
                    "metadata": metadata,
                },
                bad_request=UnprocessableMedia(f"{SERVICE} could not read this photo. Retake it.", code="unreadable_image"),
            )
        return response_output_text(payload)

    async def segment(self, image: bytes, concepts: list[str]) -> list[RawSegment]:
        # Re-encoding the EXIF-transposed image keeps SAM's pixel grid identical to the one the app draws on.
        picture = open_rgb_image(image)
        image_url = to_data_url(encode_jpeg(picture, quality=90))
        metadata = {"include_confidence": "true", "mask_encoding": "one_bit"}

        texts = await asyncio.gather(*(self._segment_text(concept, image_url, metadata) for concept in concepts))

        segments: list[RawSegment] = []
        for concept, text in zip(concepts, texts):
            boxes, _ = await parse_segmentation(text)
            for record in boxes:
                score = 1.0 if record.confidence is None else float(record.confidence)
                if score < self._score_threshold:
                    continue
                box = xyxy_to_box(record.left, record.top, record.right, record.bottom, picture.width, picture.height)
                if box.area == 0:
                    continue
                segments.append(
                    RawSegment(label=concept, score=score, x=box.x, y=box.y, width=box.width, height=box.height)
                )
        return segments

    async def isolate(self, image: bytes, x: int, y: int) -> Isolation:
        picture = open_rgb_image(image)
        width, height = picture.size
        if not (0 <= x < width and 0 <= y < height):
            raise BadPayload(f"Click ({x}, {y}) is outside the {width}x{height} image.")

        text = await self._segment_text(
            point_prompt(x, y, width, height),
            to_data_url(encode_jpeg(picture, quality=90)),
            {"include_confidence": "true"},
        )
        boxes, masks = await parse_segmentation(text)
        record = masks.get("1") or next(iter(masks.values()), None)
        if record is None:
            raise UnprocessableMedia("Nothing distinct was found at that spot. Tap closer to the item.", code="empty_mask")

        mask = mask_to_frame(record, width, height)
        box = mask_to_box(mask)
        if box is None:
            box_record = next((b for b in boxes if b.object_id == record.object_id), None)
            if box_record is None:
                raise UnprocessableMedia("Nothing distinct was found at that spot. Tap closer to the item.", code="empty_mask")
            box = xyxy_to_box(box_record.left, box_record.top, box_record.right, box_record.bottom, width, height)
            mask[box.y : box.y + box.height, box.x : box.x + box.width] = True

        return Isolation(
            x=box.x,
            y=box.y,
            width=box.width,
            height=box.height,
            mask_score=1.0 if record.confidence is None else float(record.confidence),
            crop_jpeg=render_isolated_crop(picture, mask, box),
            context_jpeg=render_context(picture, box),
        )
