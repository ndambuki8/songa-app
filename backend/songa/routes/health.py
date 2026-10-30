from __future__ import annotations

from fastapi import APIRouter, Depends

from songa.core.telemetry import StageTimer, request_timer

router = APIRouter()


@router.get("/health")
async def health(timer: StageTimer = Depends(request_timer)) -> dict[str, object]:
    return {"status": "ok", **timer.report()}
