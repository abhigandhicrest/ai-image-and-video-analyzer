"""Upload checks for short video clips. Bytes are not stored."""

from dataclasses import dataclass
from pathlib import Path

from app.config.settings import get_settings
from app.services.image_validation import sanitize_filename

ALLOWED_EXTENSIONS = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
}


class VideoValidationError(Exception):
    """A rejected video upload, with the HTTP status and error code the route should return."""

    def __init__(self, message: str, code: str = "invalid_video", status_code: int = 400) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True)
class ValidatedVideo:
    """Bytes that passed the container checks, plus a safe filename and content type."""

    data: bytes
    filename: str
    content_type: str
    size: int


def _matches_container(data: bytes, extension: str) -> bool:
    """Confirm the leading bytes look like the container named by the extension.

    MP4 and MOV keep an ftyp box near the start. WebM starts with an EBML header.
    """
    if extension in {".mp4", ".mov"}:
        window = data[:64]
        return b"ftyp" in window
    if extension == ".webm":
        return data[:4] == b"\x1a\x45\xdf\xa3"
    return False


def validate_video_bytes(data: bytes, filename: str) -> ValidatedVideo:
    """Confirm the bytes are a non-empty MP4, MOV, or WebM within the size cap.

    Duration and decodability are checked when frames are sampled.
    """
    settings = get_settings()
    safe_name = sanitize_filename(filename, "video")
    extension = Path(safe_name).suffix.lower()
    content_type = ALLOWED_EXTENSIONS.get(extension)

    if content_type is None:
        raise VideoValidationError("Upload an MP4, MOV, or WebM video.", "unsupported_type")

    if not data:
        raise VideoValidationError("The uploaded file is empty.", "empty_file")

    if len(data) > settings.max_video_bytes:
        raise VideoValidationError(
            f"Video must be {settings.max_video_bytes // (1024 * 1024)} MB or smaller.",
            "file_too_large",
            status_code=413,
        )

    if not _matches_container(data, extension):
        raise VideoValidationError(
            "The file contents do not match this video type.",
            "unsupported_type",
        )

    return ValidatedVideo(
        data=data,
        filename=safe_name,
        content_type=content_type,
        size=len(data),
    )
