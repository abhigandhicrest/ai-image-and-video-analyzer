"""Upload checks for type, size, and filename safety."""

import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.config.settings import get_settings

# Cap decoded pixels so a tiny compressed file cannot expand into a huge image.
Image.MAX_IMAGE_PIXELS = 40_000_000

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png"}


class ImageValidationError(Exception):
    """A rejected upload, with the HTTP status and error code the route should return."""

    def __init__(self, message: str, code: str = "invalid_image", status_code: int = 400) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True)
class ValidatedImage:
    """Bytes that passed validation, plus a safe filename and detected content type."""

    data: bytes
    filename: str
    content_type: str
    size: int


def sanitize_filename(filename: str, fallback: str = "image") -> str:
    """Keep only the base name and replace characters that are unsafe to store.

    Path segments are dropped so a name like '../../secret.png' cannot escape.
    The result is capped so a very long name cannot bloat a history document.
    """
    base = Path(str(filename or "")).name.replace("\x00", "")
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base).strip("._")
    if not base:
        return fallback
    suffix = Path(base).suffix.lower()
    stem = Path(base).stem.strip("._") or fallback
    if suffix:
        return f"{stem[:100]}{suffix}"[:120]
    return stem[:120]


def validate_image_bytes(data: bytes, filename: str) -> tuple[str, str]:
    """Confirm the bytes are a real JPEG or PNG whose extension matches the contents.

    Returns the sanitized filename and the matching content type.
    """
    settings = get_settings()
    safe_name = sanitize_filename(filename)
    extension = Path(safe_name).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise ImageValidationError("Upload a JPG, JPEG, or PNG image.", "unsupported_type")

    if not data:
        raise ImageValidationError("The uploaded file is empty.", "empty_file")

    if len(data) > settings.max_upload_bytes:
        raise ImageValidationError(
            "Image must be 5 MB or smaller.",
            "file_too_large",
            status_code=413,
        )

    try:
        # verify() checks the file structure; a second open loads pixels.
        with Image.open(BytesIO(data)) as image:
            image.verify()
        with Image.open(BytesIO(data)) as image:
            image_format = image.format
            image.load()
    except Image.DecompressionBombError as exc:
        raise ImageValidationError(
            "The image dimensions are too large to process safely.",
            "image_too_large",
        ) from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageValidationError(
            "The file is not a valid JPG or PNG image.",
            "invalid_image",
        ) from exc

    if image_format not in ALLOWED_FORMATS:
        raise ImageValidationError(
            "Only JPG, JPEG, and PNG images are supported.",
            "unsupported_type",
        )

    # Reject a PNG renamed to .jpg (and the reverse) so the stored type is honest.
    if extension == ".png" and image_format != "PNG":
        raise ImageValidationError(
            "The file extension does not match the image contents.",
            "extension_mismatch",
        )
    if extension in {".jpg", ".jpeg"} and image_format != "JPEG":
        raise ImageValidationError(
            "The file extension does not match the image contents.",
            "extension_mismatch",
        )

    return safe_name, ALLOWED_FORMATS[image_format]
