"""SAM 3 running in-process on a GPU with Hugging Face `transformers`. Used inside the Modal `SamGpu` container.

* Concept prompts use `Sam3Model`: the image is encoded once and every concept reuses that encoding.
* Point prompts use `Sam3TrackerModel`. Its image encoding is cached per photo, so the second and later taps on
  the same photo skip the expensive vision encoder.

Heavy imports (torch, transformers) happen in `load()`, so importing this module is cheap.
"""

from __future__ import annotations

import hashlib
import io
import logging
import threading
from collections import OrderedDict
from typing import Any

import numpy as np
from PIL import Image

from songa.vision.geometry import choose_mask, mask_to_box, xyxy_to_box

logger = logging.getLogger(__name__)

EMBEDDING_CACHE_SIZE = 8


class Sam3Runner:
    def __init__(self, model_id: str = "facebook/sam3", device: str = "cuda") -> None:
        self.model_id = model_id
        self.device = device
        # One GPU, one inference at a time; concurrent requests queue here instead of booting another GPU.
        self._lock = threading.Lock()
        self._tracker_cache: OrderedDict[str, Any] = OrderedDict()
        self._tracker_cache_supported = True

    def load(self) -> None:
        import torch
        from transformers import Sam3Model, Sam3Processor, Sam3TrackerModel, Sam3TrackerProcessor

        self._torch = torch
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        self.concept_processor = Sam3Processor.from_pretrained(self.model_id)
        self.concept_model = Sam3Model.from_pretrained(self.model_id).to(self.device).eval()
        self.tracker_processor = Sam3TrackerProcessor.from_pretrained(self.model_id)
        self.tracker_model = Sam3TrackerModel.from_pretrained(self.model_id).to(self.device).eval()

        # Warm-up so the first real request does not pay for CUDA kernel selection.
        warm = Image.new("RGB", (640, 480), (200, 180, 120))
        buffer = io.BytesIO()
        warm.save(buffer, format="JPEG")
        self.segment(buffer.getvalue(), ["object"], 0.5)
        self.isolate(buffer.getvalue(), 320, 240)
        self._tracker_cache.clear()

    # -- concept prompts -----------------------------------------------------------------------------------------

    def segment(self, jpeg: bytes, concepts: list[str], threshold: float) -> list[dict[str, Any]]:
        image = Image.open(io.BytesIO(jpeg)).convert("RGB")
        width, height = image.size
        found: list[dict[str, Any]] = []
        with self._lock, self._torch.inference_mode():
            image_inputs = self.concept_processor(images=image, return_tensors="pt").to(self.device)
            vision_embeds = self.concept_model.get_vision_features(pixel_values=image_inputs.pixel_values)
            target_sizes = image_inputs.get("original_sizes").tolist()
            for concept in concepts:
                text_inputs = self.concept_processor(text=concept, return_tensors="pt").to(self.device)
                outputs = self.concept_model(vision_embeds=vision_embeds, **text_inputs)
                result = self.concept_processor.post_process_instance_segmentation(
                    outputs, threshold=threshold, mask_threshold=0.5, target_sizes=target_sizes
                )[0]
                for box, score in zip(result["boxes"].tolist(), result["scores"].tolist()):
                    clamped = xyxy_to_box(*box, width, height)
                    if clamped.area == 0:
                        continue
                    found.append(
                        {
                            "label": concept,
                            "score": float(score),
                            "x": clamped.x,
                            "y": clamped.y,
                            "width": clamped.width,
                            "height": clamped.height,
                        }
                    )
        return found

    # -- point prompts -------------------------------------------------------------------------------------------

    def _tracker_embeddings(self, key: str, pixel_values: Any) -> Any | None:
        if not self._tracker_cache_supported:
            return None
        cached = self._tracker_cache.get(key)
        if cached is not None:
            self._tracker_cache.move_to_end(key)
            return cached
        try:
            embeddings = self.tracker_model.get_image_embeddings(pixel_values)
        except (AttributeError, TypeError) as exc:
            logger.warning("Tracker embedding cache unavailable, encoding every tap: %s", exc)
            self._tracker_cache_supported = False
            return None
        self._tracker_cache[key] = embeddings
        while len(self._tracker_cache) > EMBEDDING_CACHE_SIZE:
            self._tracker_cache.popitem(last=False)
        return embeddings

    def isolate(self, jpeg: bytes, x: int, y: int) -> dict[str, Any]:
        """Segments the object under (x, y). Returns its box, score and a bit-packed box-local mask."""
        image = Image.open(io.BytesIO(jpeg)).convert("RGB")
        width, height = image.size
        key = hashlib.sha256(jpeg).hexdigest()
        with self._lock, self._torch.inference_mode():
            inputs = self.tracker_processor(
                images=image, input_points=[[[[x, y]]]], input_labels=[[[1]]], return_tensors="pt"
            ).to(self.device)
            embeddings = self._tracker_embeddings(key, inputs["pixel_values"])
            prompt = {k: v for k, v in inputs.items() if k not in ("pixel_values", "original_sizes", "reshaped_input_sizes")}
            if embeddings is not None:
                outputs = self.tracker_model(image_embeddings=embeddings, multimask_output=True, **prompt)
            else:
                outputs = self.tracker_model(pixel_values=inputs["pixel_values"], multimask_output=True, **prompt)
            masks = self.tracker_processor.post_process_masks(outputs.pred_masks.cpu(), inputs["original_sizes"])[0]
            scores = outputs.iou_scores[0, 0].float().cpu().numpy()

        candidates = masks[0].numpy().astype(bool)  # (num_masks, H, W)
        index = choose_mask(candidates, scores, min(x, width - 1), min(y, height - 1))
        mask = candidates[index]
        box = mask_to_box(mask)
        if box is None:
            return {"empty": True}
        local = mask[box.y : box.y + box.height, box.x : box.x + box.width]
        return {
            "empty": False,
            "x": box.x,
            "y": box.y,
            "width": box.width,
            "height": box.height,
            "score": float(scores[index]),
            "mask_bits": np.packbits(local, axis=None).tobytes(),
        }


def unpack_local_mask(bits: bytes, width: int, height: int) -> np.ndarray:
    """Inverse of the packing in `Sam3Runner.isolate`."""
    flat = np.unpackbits(np.frombuffer(bits, dtype=np.uint8), count=width * height)
    return flat.reshape(height, width).astype(bool)
