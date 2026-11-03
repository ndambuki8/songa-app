from __future__ import annotations

from songa.config import Settings
from songa.engines import Engines, ImageStore
from songa.llm.muse_client import MuseWonderClient
from songa.services.meta_api import MetaApiClient
from songa.services.meta_sam import MetaSamSegmenter
from songa.services.meta_transcriber import MetaVoiceTranscriber


def build_meta_engines(settings: Settings, images: ImageStore) -> Engines:
    media = MetaApiClient(
        api_key=settings.meta_api_key, base_url=settings.meta_api_base_url, timeout_s=settings.media_timeout_s
    )
    return Engines(
        stt=MetaVoiceTranscriber(media, model=settings.transcribe_model_id),
        segmenter=MetaSamSegmenter(media, model=settings.sam_model_id, score_threshold=settings.sam_score_threshold),
        images=images,
        llm=MuseWonderClient(
            api_key=settings.meta_api_key,
            base_url=settings.meta_api_base_url,
            model=settings.muse_model_id,
            reasoning_effort=settings.muse_reasoning_effort,
            json_mode=settings.muse_json_mode,
            timeout_s=settings.muse_timeout_s,
        ),
    )
