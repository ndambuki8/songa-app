from __future__ import annotations

import base64
import binascii
import io

from PIL import Image, ImageOps, UnidentifiedImageError

from songa.core.errors import BadPayload, PayloadTooLarge, UnprocessableMedia

Image.MAX_IMAGE_PIXELS = 40_000_000


def decode_base64_payload(data: str, *, max_bytes: int, label: str) -> bytes:
    """Decodes standard or data-URI base64 with a size ceiling checked before allocation."""
    if not data:
        raise BadPayload(f"The {label} payload is empty.")

    payload = data.split(",", 1)[1] if data.startswith("data:") else data
    payload = "".join(payload.split())
    estimated = (len(payload) * 3) // 4
    if estimated > max_bytes:
        raise PayloadTooLarge(f"The {label} exceeds the {max_bytes // (1024 * 1024)} MB limit.")

    try:
        decoded = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise BadPayload(f"The {label} is not valid base64.") from exc

    if not decoded:
        raise BadPayload(f"The {label} payload is empty.")
    return decoded


def open_rgb_image(data: bytes) -> Image.Image:
    """Opens an image, applies its EXIF orientation and converts it to RGB."""
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise UnprocessableMedia("The image could not be decoded.") from exc
    return ImageOps.exif_transpose(image).convert("RGB")


def encode_jpeg(image: Image.Image, *, quality: int = 85) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality, optimize=True)
    return buffer.getvalue()


def to_data_url(jpeg: bytes) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(jpeg).decode("ascii")


def downscale(image: Image.Image, max_edge: int) -> Image.Image:
    if max(image.size) <= max_edge:
        return image
    copy = image.copy()
    copy.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    return copy
