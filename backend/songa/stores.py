from __future__ import annotations

import secrets
import time
from collections import OrderedDict
from typing import Any


def new_image_id() -> str:
    return "img_" + secrets.token_urlsafe(16)


class InMemoryImageStore:
    """Process-local image cache for local development and tests."""

    def __init__(self, ttl_s: int, max_items: int = 64) -> None:
        self._ttl_s = ttl_s
        self._max_items = max_items
        self._items: OrderedDict[str, tuple[float, bytes]] = OrderedDict()

    async def put(self, image: bytes) -> str:
        image_id = new_image_id()
        self._items[image_id] = (time.time(), image)
        while len(self._items) > self._max_items:
            self._items.popitem(last=False)
        return image_id

    async def get(self, image_id: str) -> bytes | None:
        item = self._items.get(image_id)
        if item is None or time.time() - item[0] > self._ttl_s:
            self._items.pop(image_id, None)
            return None
        return item[1]


class ModalDictImageStore:
    """Cross-container image cache on a `modal.Dict`, with an explicit TTL check on read."""

    def __init__(self, modal_dict: Any, ttl_s: int) -> None:
        self._dict = modal_dict
        self._ttl_s = ttl_s

    async def put(self, image: bytes) -> str:
        image_id = new_image_id()
        await self._dict.put.aio(image_id, {"stored_at": time.time(), "image": image})
        return image_id

    async def get(self, image_id: str) -> bytes | None:
        item = await self._dict.get.aio(image_id)
        if not item:
            return None
        if time.time() - float(item["stored_at"]) > self._ttl_s:
            await self._dict.pop.aio(image_id)
            return None
        return item["image"]
