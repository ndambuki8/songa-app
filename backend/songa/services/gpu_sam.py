"""`Segmenter` that calls SAM 3 on Songa's own Modal GPU container (`SamGpu` in modal_app.py).

The gateway stays a small CPU container. It sends the photo to the GPU class and renders the isolated crop and
outlined context itself, exactly as it does for the hosted Meta SAM, so routes and prompts are unchanged.

A GPU can take 20-30 s to boot, or longer when Modal has no free GPU of the requested type. The traveler should
never wait for that, so with a `fallback` segmenter configured:

* While the GPU is not known to be up, requests are served by the fallback (hosted Meta SAM) and the GPU is
  booted in the background.
* Once a GPU call has succeeded recently, requests go to the GPU. If it then fails or is slow, that request
  falls back and the GPU is treated as cold again.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import numpy as np

from songa.core.errors import BadPayload, UnprocessableMedia, UpstreamTimeout, UpstreamUnavailable
from songa.core.media import encode_jpeg, open_rgb_image
from songa.engines import Isolation, RawSegment, Segmenter
from songa.services.sam_local import unpack_local_mask
from songa.vision.geometry import Box, render_context, render_isolated_crop

logger = logging.getLogger(__name__)

T = TypeVar("T")


class GpuSamSegmenter:
    def __init__(
        self,
        remote: Any,
        *,
        score_threshold: float,
        fallback: Segmenter | None = None,
        ready_window_s: float = 150.0,
        warm_timeout_s: float = 20.0,
        cold_timeout_s: float = 90.0,
        boot_timeout_s: float = 900.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """`remote` is a `SamGpu()` handle; its methods are awaited with `.remote.aio(...)`.

        `ready_window_s` should be a little shorter than the GPU container's scaledown window: a GPU that answered
        within that window is assumed to still be up.
        """
        self._remote = remote
        self._score_threshold = score_threshold
        self._fallback = fallback
        self._ready_window_s = ready_window_s
        self._warm_timeout_s = warm_timeout_s
        self._cold_timeout_s = cold_timeout_s
        self._boot_timeout_s = boot_timeout_s
        self._clock = clock
        self._last_ok: float | None = None
        self._boot_task: asyncio.Task[None] | None = None
        #: "gpu" or "fallback" for the most recent call; routes report it in `timings` for observability.
        self.last_served_by: str | None = None

    # -- readiness -----------------------------------------------------------------------------------------------

    @property
    def gpu_ready(self) -> bool:
        return self._last_ok is not None and self._clock() - self._last_ok < self._ready_window_s

    def _mark_ok(self) -> None:
        self._last_ok = self._clock()

    def _ensure_booting(self) -> None:
        if self._boot_task is None or self._boot_task.done():
            self._boot_task = asyncio.create_task(self._boot())

    async def _boot(self) -> None:
        started = self._clock()
        try:
            await asyncio.wait_for(self._remote.ping.remote.aio(), timeout=self._boot_timeout_s)
        except Exception:
            logger.warning("SAM GPU did not come up within %.0fs", self._boot_timeout_s, exc_info=True)
            return
        self._mark_ok()
        # Printed rather than logged at INFO so it shows in `modal app logs` with default logging.
        print(f"SAM GPU ready after {self._clock() - started:.1f}s; segmentation now runs on the GPU")

    async def warm(self) -> None:
        """Starts booting the GPU in the background and returns immediately."""
        self._ensure_booting()

    # -- calls ---------------------------------------------------------------------------------------------------

    async def _call(self, method: str, timeout_s: float, *args: Any) -> Any:
        try:
            result = await asyncio.wait_for(getattr(self._remote, method).remote.aio(*args), timeout=timeout_s)
        except asyncio.TimeoutError as exc:
            raise UpstreamTimeout("The SAM GPU did not respond in time. Try again.") from exc
        except Exception as exc:  # Modal raises its own error types; surface them uniformly.
            logger.exception("SAM GPU call %s failed", method)
            raise UpstreamUnavailable("The SAM GPU is unavailable right now. Try again shortly.") from exc
        self._mark_ok()
        return result

    async def _route(self, gpu: Callable[[float], Awaitable[T]], fallback: Callable[[Segmenter], Awaitable[T]]) -> T:
        if self._fallback is None:
            self.last_served_by = "gpu"
            return await gpu(self._cold_timeout_s)
        if not self.gpu_ready:
            self._ensure_booting()
            self.last_served_by = "fallback"
            return await fallback(self._fallback)
        try:
            self.last_served_by = "gpu"
            return await gpu(self._warm_timeout_s)
        except (UpstreamTimeout, UpstreamUnavailable):
            logger.warning("SAM GPU failed while warm; falling back and re-booting")
            self._last_ok = None
            self._ensure_booting()
            self.last_served_by = "fallback"
            return await fallback(self._fallback)

    async def segment(self, image: bytes, concepts: list[str]) -> list[RawSegment]:
        async def on_gpu(timeout_s: float) -> list[RawSegment]:
            jpeg = encode_jpeg(open_rgb_image(image), quality=90)
            found = await self._call("segment", timeout_s, jpeg, concepts, self._score_threshold)
            return [
                RawSegment(
                    label=str(item["label"]),
                    score=float(item["score"]),
                    x=int(item["x"]),
                    y=int(item["y"]),
                    width=int(item["width"]),
                    height=int(item["height"]),
                )
                for item in found
            ]

        return await self._route(on_gpu, lambda other: other.segment(image, concepts))

    async def isolate(self, image: bytes, x: int, y: int) -> Isolation:
        picture = open_rgb_image(image)
        width, height = picture.size
        if not (0 <= x < width and 0 <= y < height):
            raise BadPayload(f"Click ({x}, {y}) is outside the {width}x{height} image.")

        async def on_gpu(timeout_s: float) -> Isolation:
            result = await self._call("isolate", timeout_s, encode_jpeg(picture, quality=90), x, y)
            if result.get("empty"):
                raise UnprocessableMedia(
                    "Nothing distinct was found at that spot. Tap closer to the item.", code="empty_mask"
                )
            box = Box(int(result["x"]), int(result["y"]), int(result["width"]), int(result["height"]))
            mask = np.zeros((height, width), dtype=bool)
            mask[box.y : box.y + box.height, box.x : box.x + box.width] = unpack_local_mask(
                result["mask_bits"], box.width, box.height
            )
            return Isolation(
                x=box.x,
                y=box.y,
                width=box.width,
                height=box.height,
                mask_score=float(result["score"]),
                crop_jpeg=render_isolated_crop(picture, mask, box),
                context_jpeg=render_context(picture, box),
            )

        return await self._route(on_gpu, lambda other: other.isolate(image, x, y))
