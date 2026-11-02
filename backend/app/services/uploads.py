"""Read multipart uploads with a hard size cap before validation."""

from fastapi import UploadFile

from app.config.settings import get_settings
from app.errors import api_error
from app.services.image_validation import ImageValidationError, ValidatedImage, validate_image_bytes
from app.services.video_validation import VideoValidationError, ValidatedVideo, validate_video_bytes


async def _read_limited(upload: UploadFile, limit: int, too_large_message: str) -> bytes:
    """Read the upload in 1 MB chunks and stop once the size cap is passed.

    Checking while reading avoids holding an oversized body in memory.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise api_error(413, too_large_message, "file_too_large")
        chunks.append(chunk)
    return b"".join(chunks)


async def read_valid_image(file: UploadFile) -> ValidatedImage:
    """Accept an upload only when it is a non-empty JPG or PNG within the size cap.

    The file handle is always closed, including when validation fails.
    """
    settings = get_settings()
    try:
        # Reject early when the client already reported a size over the cap.
        if file.size is not None and file.size > settings.max_upload_bytes:
            raise api_error(413, "Image must be 5 MB or smaller.", "file_too_large")
        if not file.filename:
            raise api_error(400, "The uploaded file needs a filename.", "missing_filename")

        data = await _read_limited(file, settings.max_upload_bytes, "Image must be 5 MB or smaller.")
        if not data:
            raise api_error(400, "The uploaded file is empty.", "empty_file")

        try:
            filename, content_type = validate_image_bytes(data, file.filename)
        except ImageValidationError as exc:
            raise api_error(exc.status_code, exc.message, exc.code) from exc

        return ValidatedImage(
            data=data,
            filename=filename,
            content_type=content_type,
            size=len(data),
        )
    finally:
        await file.close()


def _megabyte_label(num_bytes: int) -> str:
    """Format a byte cap as a whole number of megabytes when it divides evenly."""
    megabytes = num_bytes / (1024 * 1024)
    if megabytes.is_integer():
        return str(int(megabytes))
    return f"{megabytes:.1f}"


async def read_valid_video(file: UploadFile) -> ValidatedVideo:
    """Accept an upload only when it is a non-empty MP4, MOV, or WebM within the size cap.

    Duration is checked later, once the file is opened for frame sampling.
    The file handle is always closed, including when validation fails.
    """
    settings = get_settings()
    too_large = f"Video must be {_megabyte_label(settings.max_video_bytes)} MB or smaller."
    try:
        if file.size is not None and file.size > settings.max_video_bytes:
            raise api_error(413, too_large, "file_too_large")
        if not file.filename:
            raise api_error(400, "The uploaded file needs a filename.", "missing_filename")

        data = await _read_limited(file, settings.max_video_bytes, too_large)
        if not data:
            raise api_error(400, "The uploaded file is empty.", "empty_file")

        try:
            return validate_video_bytes(data, file.filename)
        except VideoValidationError as exc:
            raise api_error(exc.status_code, exc.message, exc.code) from exc
    finally:
        await file.close()
