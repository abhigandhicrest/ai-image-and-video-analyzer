"""Image and video analysis endpoints backed by AWS Rekognition."""

import asyncio
import logging
from types import SimpleNamespace

from fastapi import APIRouter, File, Query, UploadFile

from app.config.settings import get_settings
from app.errors import api_error
from app.models.schemas import AnalysisRecord
from app.services.history_service import record_analysis
from app.services.image_validation import ValidatedImage
from app.services.rekognition_service import (
    RekognitionError,
    detect_faces,
    detect_labels,
    detect_moderation_labels,
    detect_text,
)
from app.services.uploads import read_valid_image, read_valid_video
from app.services.video_aggregate import aggregate_video_frames
from app.services.video_analysis import sample_video
from app.services.video_validation import VideoValidationError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analyze"])


def _thresholds(
    review_threshold: float | None,
    restricted_threshold: float | None,
) -> tuple[float, float]:
    """Resolve moderation cutoffs, falling back to server defaults.

    A request may override either value. Review must stay at or below restricted.
    """
    settings = get_settings()
    review = settings.moderation_review_threshold if review_threshold is None else review_threshold
    restricted = (
        settings.moderation_restricted_threshold if restricted_threshold is None else restricted_threshold
    )
    if review > restricted:
        raise api_error(
            400,
            "The review threshold cannot be higher than the restricted threshold.",
            "invalid_threshold",
        )
    return review, restricted


def _min_confidence(min_confidence: float | None) -> float:
    """Use the requested label confidence, or the server default when omitted."""
    if min_confidence is None:
        return get_settings().label_min_confidence
    return min_confidence


async def _execute(action: str, func, *args):
    """Run a blocking Rekognition call off the event loop.

    Rekognition failures become HTTP 502 with the service's own message and code.
    """
    try:
        return await asyncio.to_thread(func, *args)
    except RekognitionError as exc:
        raise api_error(502, f"{action} {exc.message}", exc.code) from exc


def _store(image: ValidatedImage, analysis_type: str, results: dict, thresholds: dict | None) -> dict:
    """Log the finished analysis and persist scores without storing image bytes."""
    logger.info("Completed %s analysis for %s (%s bytes)", analysis_type, image.filename, image.size)
    return record_analysis(image, analysis_type, results, thresholds)


@router.post("/analyze/labels", response_model=AnalysisRecord, summary="Detect objects with DetectLabels")
async def analyze_labels(
    file: UploadFile = File(...),
    min_confidence: float | None = Query(default=None, ge=0, le=100),
) -> dict:
    """Detect labels only and save that result as analysis type 'labels'."""
    image = await read_valid_image(file)
    confidence = _min_confidence(min_confidence)
    labels = await _execute("Object detection failed.", detect_labels, image.data, confidence)
    return _store(
        image,
        "labels",
        {"labels": labels},
        {"label_min_confidence": confidence},
    )


@router.post("/analyze/faces", response_model=AnalysisRecord, summary="Detect faces with DetectFaces")
async def analyze_faces(file: UploadFile = File(...)) -> dict:
    """Detect faces only and save that result as analysis type 'faces'."""
    image = await read_valid_image(file)
    faces = await _execute("Face detection failed.", detect_faces, image.data)
    return _store(image, "faces", {"faces": faces}, None)


@router.post("/analyze/text", response_model=AnalysisRecord, summary="Extract text with DetectText")
async def analyze_text(file: UploadFile = File(...)) -> dict:
    """Extract text only and save that result as analysis type 'text'."""
    image = await read_valid_image(file)
    text = await _execute("Text detection failed.", detect_text, image.data)
    return _store(image, "text", {"text": text}, None)


@router.post(
    "/analyze/moderation",
    response_model=AnalysisRecord,
    summary="Moderate content with DetectModerationLabels",
)
async def analyze_moderation(
    file: UploadFile = File(...),
    review_threshold: float | None = Query(default=None, ge=0, le=100),
    restricted_threshold: float | None = Query(default=None, ge=0, le=100),
) -> dict:
    """Run content moderation only and save that result as analysis type 'moderation'."""
    image = await read_valid_image(file)
    review, restricted = _thresholds(review_threshold, restricted_threshold)
    moderation = await _execute(
        "Content moderation failed.",
        detect_moderation_labels,
        image.data,
        review,
        restricted,
    )
    return _store(
        image,
        "moderation",
        {"moderation": moderation},
        {"review": review, "restricted": restricted},
    )


@router.post("/analyze", response_model=AnalysisRecord, summary="Run labels, faces, text, and moderation")
async def analyze_image(
    file: UploadFile = File(...),
    min_confidence: float | None = Query(default=None, ge=0, le=100),
    review_threshold: float | None = Query(default=None, ge=0, le=100),
    restricted_threshold: float | None = Query(default=None, ge=0, le=100),
) -> dict:
    """Run all four Rekognition operations together and save one 'full' record.

    The four calls share the same image bytes and run concurrently. One
    failure fails the whole request.
    """
    image = await read_valid_image(file)
    confidence = _min_confidence(min_confidence)
    review, restricted = _thresholds(review_threshold, restricted_threshold)
    labels, faces, text, moderation = await asyncio.gather(
        _execute("Object detection failed.", detect_labels, image.data, confidence),
        _execute("Face detection failed.", detect_faces, image.data),
        _execute("Text detection failed.", detect_text, image.data),
        _execute(
            "Content moderation failed.",
            detect_moderation_labels,
            image.data,
            review,
            restricted,
        ),
    )
    return _store(
        image,
        "full",
        {"labels": labels, "faces": faces, "text": text, "moderation": moderation},
        {
            "review": review,
            "restricted": restricted,
            "label_min_confidence": confidence,
        },
    )


async def _limited(semaphore: asyncio.Semaphore, action: str, func, *args):
    """Run one Rekognition call, sharing a semaphore with the other frame calls."""
    async with semaphore:
        return await _execute(action, func, *args)


@router.post(
    "/analyze/video",
    response_model=AnalysisRecord,
    summary="Sample frames and run labels, faces, text, and moderation",
)
async def analyze_video(
    file: UploadFile = File(...),
    min_confidence: float | None = Query(default=None, ge=0, le=100),
    review_threshold: float | None = Query(default=None, ge=0, le=100),
    restricted_threshold: float | None = Query(default=None, ge=0, le=100),
) -> dict:
    """Sample a short video and analyze each frame with the image Rekognition APIs.

    The clip is decoded on the server. Frames are spaced through the video, and
    at most four Rekognition calls run at once. The temp file and the video
    bytes are discarded after sampling. One Rekognition failure fails the request.
    """
    video = await read_valid_video(file)
    confidence = _min_confidence(min_confidence)
    review, restricted = _thresholds(review_threshold, restricted_threshold)
    source = SimpleNamespace(filename=video.filename, size=video.size, content_type=video.content_type)
    data = video.data
    del video
    try:
        sampled = await asyncio.to_thread(sample_video, data, source.filename)
    except VideoValidationError as exc:
        raise api_error(exc.status_code, exc.message, exc.code) from exc
    finally:
        del data

    semaphore = asyncio.Semaphore(4)

    async def analyze_frame(frame):
        labels, faces, text, moderation = await asyncio.gather(
            _limited(semaphore, "Object detection failed.", detect_labels, frame.jpeg, confidence),
            _limited(semaphore, "Face detection failed.", detect_faces, frame.jpeg),
            _limited(semaphore, "Text detection failed.", detect_text, frame.jpeg),
            _limited(
                semaphore,
                "Content moderation failed.",
                detect_moderation_labels,
                frame.jpeg,
                review,
                restricted,
            ),
        )
        return {
            "index": frame.index,
            "timestamp_ms": frame.timestamp_ms,
            "labels": labels,
            "faces": faces,
            "text": text,
            "moderation": moderation,
        }

    frame_results = list(await asyncio.gather(*(analyze_frame(frame) for frame in sampled.frames)))
    frame_results.sort(key=lambda item: item["index"])
    combined = aggregate_video_frames(frame_results)
    return _store(
        source,
        "video",
        {
            "labels": combined["labels"],
            "faces": combined["faces"],
            "text": combined["text"],
            "moderation": combined["moderation"],
            "video": {
                "duration_ms": sampled.duration_ms,
                "frame_count": len(frame_results),
                "width": sampled.width,
                "height": sampled.height,
                "frames": frame_results,
            },
        },
        {
            "review": review,
            "restricted": restricted,
            "label_min_confidence": confidence,
        },
    )
