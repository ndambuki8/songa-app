from __future__ import annotations

import asyncio

import numpy as np

from songa.services.gpu_sam import GpuSamSegmenter
from tests.fakes import FakeSegmenter, make_jpeg_b64


class _Method:
    def __init__(self, handler):
        self.remote = self
        self._handler = handler

    async def aio(self, *args):
        return await self._handler(*args)


class FakeGpu:
    """Mimics `SamGpu()`: methods are awaited as `handle.method.remote.aio(...)`."""

    def __init__(self, *, ping_delay: float = 0.0, fail: bool = False):
        self.calls: list[str] = []
        self.fail = fail

        async def ping():
            self.calls.append("ping")
            await asyncio.sleep(ping_delay)
            return "ready"

        async def segment(jpeg, concepts, threshold):
            self.calls.append("segment")
            if self.fail:
                raise RuntimeError("container lost")
            return [{"label": concepts[0], "score": 0.9, "x": 1, "y": 2, "width": 30, "height": 40}]

        async def isolate(jpeg, x, y):
            self.calls.append("isolate")
            local = np.ones((10, 12), dtype=bool)
            return {"empty": False, "x": 5, "y": 6, "width": 12, "height": 10, "score": 0.8,
                    "mask_bits": np.packbits(local, axis=None).tobytes()}

        self.ping = _Method(ping)
        self.segment = _Method(segment)
        self.isolate = _Method(isolate)


def _image() -> bytes:
    import base64

    return base64.b64decode(make_jpeg_b64(200, 150))


def test_cold_gpu_serves_fallback_and_boots_in_background():
    gpu, fallback = FakeGpu(ping_delay=0.05), FakeSegmenter()
    segmenter = GpuSamSegmenter(gpu, score_threshold=0.3, fallback=fallback)

    async def scenario():
        first = await segmenter.segment(_image(), ["menu item"])
        assert gpu.calls == [] or gpu.calls == ["ping"]
        assert [s.label for s in first] == [s.label for s in fallback.segments]
        await asyncio.sleep(0.1)  # boot finishes
        assert segmenter.gpu_ready
        second = await segmenter.segment(_image(), ["menu item"])
        return second

    second = asyncio.run(scenario())
    assert gpu.calls == ["ping", "segment"]
    assert [(s.label, s.width) for s in second] == [("menu item", 30)]


def test_warm_gpu_failure_falls_back_and_marks_cold():
    gpu, fallback = FakeGpu(), FakeSegmenter()
    segmenter = GpuSamSegmenter(gpu, score_threshold=0.3, fallback=fallback)

    async def scenario():
        await segmenter.warm()
        await asyncio.sleep(0.01)
        assert segmenter.gpu_ready
        gpu.fail = True
        result = await segmenter.segment(_image(), ["price"])
        return result

    result = asyncio.run(scenario())
    assert len(result) == len(fallback.segments)
    assert "segment" in gpu.calls


def test_gpu_isolation_unpacks_mask_into_frame():
    gpu = FakeGpu()
    segmenter = GpuSamSegmenter(gpu, score_threshold=0.3)  # no fallback: always the GPU
    isolation = asyncio.run(segmenter.isolate(_image(), 10, 10))
    assert (isolation.x, isolation.y, isolation.width, isolation.height) == (5, 6, 12, 10)
    assert isolation.crop_jpeg[:2] == b"\xff\xd8" and isolation.context_jpeg[:2] == b"\xff\xd8"
