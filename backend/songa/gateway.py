from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from songa.config import Settings
from songa.core.auth import require_api_key
from songa.core.errors import SongaError
from songa.core.telemetry import elapsed_ms
from songa.engines import Engines
from songa.routes import cards, dialogue, health, logbook, vision

logger = logging.getLogger("songa.gateway")


def _error_response(request: Request, status: int, code: str, message: str) -> JSONResponse:
    started = getattr(request.state, "started", None)
    return JSONResponse(
        status_code=status,
        content={
            "error": {"code": code, "message": message},
            "latency_ms": elapsed_ms(started) if started is not None else 0,
        },
    )


def create_app(settings: Settings, engines: Engines) -> FastAPI:
    app = FastAPI(title="Songa Gateway", version="1.0.0", docs_url="/docs", redoc_url=None)
    app.state.settings = settings
    app.state.engines = engines

    if not settings.api_key and settings.allow_unauthenticated:
        logger.warning("SONGA_API_KEY is unset and SONGA_ALLOW_UNAUTHENTICATED is on: the API is open.")

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.middleware("http")
    async def latency_middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request.state.started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Songa-Latency-Ms"] = str(elapsed_ms(request.state.started))
        return response

    @app.exception_handler(SongaError)
    async def songa_error_handler(request: Request, exc: SongaError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.warning("%s %s -> %s %s", request.method, request.url.path, exc.code, exc.message)
        return _error_response(request, exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        location = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
        detail = first.get("msg", "Invalid request")
        message = f"{location}: {detail}" if location else str(detail)
        return _error_response(request, 422, "invalid_request", message)

    @app.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return _error_response(request, 500, "internal_error", "An unexpected server error occurred.")

    protected = [Depends(require_api_key)]
    app.include_router(health.router)
    app.include_router(dialogue.router, dependencies=protected)
    app.include_router(vision.router, dependencies=protected)
    app.include_router(logbook.router, dependencies=protected)
    app.include_router(cards.router, dependencies=protected)
    return app
