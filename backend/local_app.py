"""Runs the gateway on this machine without Modal. From the `backend/` directory:

    uvicorn local_app:app --host 0.0.0.0 --port 8000 --env-file .env --reload

Uses an in-process photo cache, so run a single worker.
"""

from __future__ import annotations

from songa.bootstrap import build_meta_engines
from songa.config import Settings
from songa.gateway import create_app
from songa.stores import InMemoryImageStore

settings = Settings.from_env()
app = create_app(settings, build_meta_engines(settings, InMemoryImageStore(settings.image_cache_ttl_s)))
