from __future__ import annotations

import io

import numpy as np
from PIL import Image

from songa.engines import RawSegment
from songa.vision.geometry import (
    Box,
    choose_mask,
    iou,
    mask_to_box,
    pad_box,
    refine_segments,
    render_context,
    render_isolated_crop,
    xyxy_to_box,
)


def test_xyxy_to_box_clamps_and_orders():
    assert xyxy_to_box(-5.2, 10.7, 50.1, 5.0, 40, 40) == Box(0, 5, 40, 6)


def test_mask_to_box():
    mask = np.zeros((10, 10), dtype=bool)
    mask[2:5, 3:8] = True
    assert mask_to_box(mask) == Box(3, 2, 5, 3)
    assert mask_to_box(np.zeros((4, 4), dtype=bool)) is None


def test_iou():
    assert iou(Box(0, 0, 10, 10), Box(0, 0, 10, 10)) == 1.0
    assert iou(Box(0, 0, 10, 10), Box(20, 20, 5, 5)) == 0.0
    assert abs(iou(Box(0, 0, 10, 10), Box(5, 0, 10, 10)) - 1 / 3) < 1e-9


def test_refine_segments_applies_nms_area_filters_and_cap():
    segments = [
        RawSegment("a", 0.9, 0, 0, 100, 100),
        RawSegment("b", 0.8, 2, 2, 100, 100),
        RawSegment("c", 0.7, 300, 300, 50, 50),
        RawSegment("speck", 0.99, 0, 0, 3, 3),
        RawSegment("frame", 0.95, 0, 0, 1000, 1000),
    ]
    refined = refine_segments(segments, image_w=1000, image_h=1000)
    assert [s.label for s in refined] == ["a", "c"]
    assert len(refine_segments(segments, image_w=1000, image_h=1000, max_count=1)) == 1


def test_choose_mask_prefers_masks_covering_click():
    masks = np.zeros((3, 10, 10), dtype=bool)
    masks[0, 0:3, 0:3] = True
    masks[1, 5:9, 5:9] = True
    masks[2, :, :] = True
    scores = np.array([0.99, 0.6, 0.5])
    assert choose_mask(masks, scores, 6, 6) == 1
    assert choose_mask(np.zeros((2, 4, 4), dtype=bool), np.array([0.2, 0.7]), 1, 1) == 1


def test_pad_box_respects_bounds_and_min_size():
    padded = pad_box(Box(0, 0, 10, 10), image_w=50, image_h=50, min_size=40)
    assert padded.x == 0 and padded.y == 0
    assert padded.width >= 25 and padded.height >= 25
    assert pad_box(Box(90, 90, 10, 10), image_w=100, image_h=100).x + pad_box(Box(90, 90, 10, 10), image_w=100, image_h=100).width <= 100


def test_renders_are_valid_jpegs():
    image = Image.new("RGB", (400, 300), (10, 20, 30))
    mask = np.zeros((300, 400), dtype=bool)
    mask[100:150, 100:200] = True
    box = Box(100, 100, 100, 50)

    crop = Image.open(io.BytesIO(render_isolated_crop(image, mask, box)))
    assert crop.format == "JPEG" and crop.width > 100

    context = Image.open(io.BytesIO(render_context(image, box, max_edge=200)))
    assert max(context.size) == 200
