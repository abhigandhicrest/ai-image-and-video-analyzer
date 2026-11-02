"""Sample evenly spaced JPEG frames from a short video. The file is not kept."""

import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.config.settings import get_settings
from app.services.video_validation import VideoValidationError

logger = logging.getLogger(__name__)

# Rekognition image calls accept at most 5 MB of JPEG bytes.
_MAX_JPEG_BYTES = 5 * 1024 * 1024
_MAX_FRAME_SIDE = 1280


@dataclass(frozen=True)
class SampledFrame:
    """One JPEG frame and the timestamp it was taken from, in milliseconds."""

    index: int
    timestamp_ms: int
    jpeg: bytes
    width: int
    height: int


@dataclass(frozen=True)
class SampledVideo:
    """Frames chosen for Rekognition, plus the clip duration and picture size."""

    duration_ms: int
    width: int
    height: int
    frames: list[SampledFrame]


def _load_cv2():
    """Import OpenCV when a video is sampled, so history routes do not load it."""
    try:
        import cv2
    except ImportError as exc:
        raise VideoValidationError(
            "Video decoding is unavailable on the server.",
            "decoder_unavailable",
            status_code=500,
        ) from exc
    return cv2


def _fit(cv2, frame, max_side: int):
    """Shrink a frame so its longer side is at most max_side pixels."""
    height, width = frame.shape[:2]
    longest = max(height, width)
    if longest <= max_side:
        return frame
    scale = max_side / longest
    size = (max(1, int(width * scale)), max(1, int(height * scale)))
    return cv2.resize(frame, size, interpolation=cv2.INTER_AREA)


def _to_jpeg(cv2, frame) -> bytes:
    """Encode a frame as JPEG, shrinking further if it would exceed Rekognition's image cap."""
    image = _fit(cv2, frame, _MAX_FRAME_SIDE)
    quality = 85
    while quality >= 40:
        ok, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        if not ok:
            raise VideoValidationError("A video frame could not be encoded.", "frame_encode_failed")
        data = encoded.tobytes()
        if len(data) <= _MAX_JPEG_BYTES:
            return data
        quality -= 15
        image = _fit(cv2, image, int(max(image.shape[:2]) * 0.75))
    raise VideoValidationError("A video frame is too large to analyze.", "frame_too_large")


def _duration_ms(cv2, capture) -> int:
    """Estimate duration from frame count and fps, then from a seek to the end."""
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    count = float(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if fps > 1 and count > 1:
        return int(round(count / fps * 1000))
    capture.set(cv2.CAP_PROP_POS_AVI_RATIO, 1)
    tail = float(capture.get(cv2.CAP_PROP_POS_MSEC) or 0)
    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
    if tail > 0:
        return int(round(tail))
    return 0


def _timestamps(duration_ms: int, samples: int) -> list[float]:
    """Spread sample times through the clip, staying off the exact first and last edges."""
    if samples <= 1:
        return [duration_ms / 2]
    start = duration_ms * 0.05
    end = duration_ms * 0.95
    if end <= start:
        return [duration_ms / 2]
    step = (end - start) / (samples - 1)
    return [start + (index * step) for index in range(samples)]


def _read_at(cv2, capture, timestamp_ms: float, fps: float):
    """Seek to a timestamp and return the frame, trying nearby indexes when the seek misses."""
    capture.set(cv2.CAP_PROP_POS_MSEC, max(0, timestamp_ms))
    ok, frame = capture.read()
    if ok and frame is not None:
        actual = float(capture.get(cv2.CAP_PROP_POS_MSEC) or 0)
        return frame, int(round(actual if actual > 0 else timestamp_ms))
    if fps > 1:
        target = int(timestamp_ms / 1000 * fps)
        for delta in (0, -1, 1, -2, 2, -5, 5):
            capture.set(cv2.CAP_PROP_POS_FRAMES, max(0, target + delta))
            ok, frame = capture.read()
            if ok and frame is not None:
                actual = float(capture.get(cv2.CAP_PROP_POS_MSEC) or 0)
                return frame, int(round(actual if actual > 0 else timestamp_ms))
    return None, int(round(timestamp_ms))


def _sample_path(path: str) -> SampledVideo:
    """Open a video on disk, reject clips that are too long, and return JPEG samples."""
    cv2 = _load_cv2()
    settings = get_settings()
    capture = cv2.VideoCapture(path)
    try:
        if not capture.isOpened():
            raise VideoValidationError(
                "This video could not be opened. Use an MP4, MOV, or WebM file.",
                "unreadable_video",
            )
        duration_ms = _duration_ms(cv2, capture)
        if duration_ms <= 0:
            raise VideoValidationError("Could not read the video duration.", "unreadable_video")
        if duration_ms > settings.max_video_seconds * 1000:
            raise VideoValidationError(
                f"Video must be {settings.max_video_seconds} seconds or shorter.",
                "video_too_long",
            )

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        samples = min(settings.video_sample_frames, 8)
        if frame_count > 0:
            samples = min(samples, frame_count)
        samples = max(1, samples)

        frames: list[SampledFrame] = []
        width = 0
        height = 0
        for timestamp_ms in _timestamps(duration_ms, samples):
            frame, actual_ms = _read_at(cv2, capture, timestamp_ms, fps)
            if frame is None:
                continue
            source_height, source_width = frame.shape[:2]
            if width == 0:
                width = int(source_width)
                height = int(source_height)
            frames.append(
                SampledFrame(
                    index=len(frames),
                    timestamp_ms=actual_ms,
                    jpeg=_to_jpeg(cv2, frame),
                    width=int(source_width),
                    height=int(source_height),
                )
            )
        if not frames:
            raise VideoValidationError("No frames could be read from this video.", "unreadable_video")
        return SampledVideo(duration_ms=duration_ms, width=width, height=height, frames=frames)
    finally:
        capture.release()


def sample_video(data: bytes, filename: str) -> SampledVideo:
    """Write the clip to a temp file, sample frames, and always delete the file."""
    suffix = Path(filename).suffix.lower()
    if suffix not in {".mp4", ".mov", ".webm"}:
        suffix = ".mp4"
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    path = handle.name
    try:
        handle.write(data)
        handle.close()
        sampled = _sample_path(path)
        logger.info("Sampled %s frames from %s (%s ms)", len(sampled.frames), filename, sampled.duration_ms)
        return sampled
    finally:
        if not handle.closed:
            handle.close()
        try:
            os.remove(path)
        except OSError:
            logger.warning("Temporary video file could not be deleted.")
