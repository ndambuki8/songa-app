from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw and raw.strip() else default


@dataclass(frozen=True)
class Settings:
    """Runtime configuration, read from the `songa-secrets` Modal secret or the local environment."""

    api_key: str = ""
    allow_unauthenticated: bool = False

    meta_api_key: str = ""
    meta_api_base_url: str = "https://api.meta.ai/v1"
    muse_model_id: str = "muse-wonder-1.0"
    muse_reasoning_effort: str = "low"
    # Speak is latency-critical: "minimal" measured ~2.2 s median vs ~3.5 s for "low" with the same output.
    speak_reasoning_effort: str = "minimal"
    muse_json_mode: bool = True
    muse_timeout_s: float = 40.0

    transcribe_model_id: str = "muse-voice-transcribe-1.0"
    sam_model_id: str = "sam-3.1"
    # "meta": hosted SAM 3.1 on the Meta Model API. "modal": Songa's own SAM 3 on a Modal GPU (class SamGpu).
    sam_backend: str = "meta"
    sam_score_threshold: float = 0.35
    media_timeout_s: float = 60.0

    max_audio_bytes: int = 12 * 1024 * 1024
    max_image_bytes: int = 8 * 1024 * 1024
    max_logbook_entries: int = 80
    image_cache_ttl_s: int = 30 * 60

    cors_origins: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_env(cls) -> Settings:
        origins = tuple(o.strip() for o in os.environ.get("SONGA_CORS_ORIGINS", "").split(",") if o.strip())
        return cls(
            api_key=os.environ.get("SONGA_API_KEY", ""),
            allow_unauthenticated=_env_bool("SONGA_ALLOW_UNAUTHENTICATED", False),
            meta_api_key=os.environ.get("META_API_KEY", os.environ.get("MODEL_API_KEY", "")),
            meta_api_base_url=os.environ.get("META_API_BASE_URL", cls.meta_api_base_url).rstrip("/"),
            muse_model_id=os.environ.get("MUSE_MODEL_ID", cls.muse_model_id),
            muse_reasoning_effort=os.environ.get("MUSE_REASONING_EFFORT", cls.muse_reasoning_effort),
            speak_reasoning_effort=os.environ.get("SPEAK_REASONING_EFFORT", cls.speak_reasoning_effort),
            muse_json_mode=_env_bool("MUSE_JSON_MODE", True),
            muse_timeout_s=float(os.environ.get("MUSE_TIMEOUT_S", cls.muse_timeout_s)),
            transcribe_model_id=os.environ.get("TRANSCRIBE_MODEL_ID", cls.transcribe_model_id),
            sam_model_id=os.environ.get("SAM_MODEL_ID", cls.sam_model_id),
            sam_backend=os.environ.get("SAM_BACKEND", cls.sam_backend).strip().lower() or cls.sam_backend,
            sam_score_threshold=float(os.environ.get("SAM_SCORE_THRESHOLD", cls.sam_score_threshold)),
            media_timeout_s=float(os.environ.get("META_MEDIA_TIMEOUT_S", cls.media_timeout_s)),
            max_audio_bytes=_env_int("SONGA_MAX_AUDIO_BYTES", cls.max_audio_bytes),
            max_image_bytes=_env_int("SONGA_MAX_IMAGE_BYTES", cls.max_image_bytes),
            max_logbook_entries=_env_int("SONGA_MAX_LOGBOOK_ENTRIES", cls.max_logbook_entries),
            image_cache_ttl_s=_env_int("SONGA_IMAGE_CACHE_TTL_S", cls.image_cache_ttl_s),
            cors_origins=origins,
        )
