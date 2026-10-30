from __future__ import annotations


class SongaError(Exception):
    """Base for every fault surfaced to clients. Carries a semantic HTTP status and a stable code."""

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code


class BadPayload(SongaError):
    status_code = 400
    code = "bad_payload"


class Unauthorized(SongaError):
    status_code = 401
    code = "unauthorized"


class ResourceExpired(SongaError):
    status_code = 410
    code = "expired"


class PayloadTooLarge(SongaError):
    status_code = 413
    code = "payload_too_large"


class UnprocessableMedia(SongaError):
    status_code = 422
    code = "unprocessable_media"


class UpstreamModelError(SongaError):
    status_code = 502
    code = "upstream_model_error"


class UpstreamUnavailable(SongaError):
    status_code = 503
    code = "upstream_unavailable"


class UpstreamTimeout(SongaError):
    status_code = 504
    code = "upstream_timeout"


class ServiceMisconfigured(SongaError):
    status_code = 503
    code = "service_misconfigured"
