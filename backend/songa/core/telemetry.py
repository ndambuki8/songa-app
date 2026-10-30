from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import Request


def elapsed_ms(started: float) -> int:
    return int(round((time.perf_counter() - started) * 1000))


class StageTimer:
    """Measures total request latency from ingestion plus a per-stage breakdown."""

    def __init__(self, started: float | None = None) -> None:
        self.started = started if started is not None else time.perf_counter()
        self.stages: dict[str, int] = {}

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        stage_started = time.perf_counter()
        try:
            yield
        finally:
            self.stages[name] = self.stages.get(name, 0) + elapsed_ms(stage_started)

    def report(self) -> dict[str, object]:
        return {"latency_ms": elapsed_ms(self.started), "timings": dict(self.stages)}


def request_timer(request: Request) -> StageTimer:
    """FastAPI dependency: a timer anchored to the moment the middleware received the request."""
    return StageTimer(getattr(request.state, "started", None))
