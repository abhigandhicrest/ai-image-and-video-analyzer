"""Persist and query analysis documents. Image and video bytes are never stored."""

import logging
import re
from datetime import datetime, timezone
from typing import Protocol

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import PyMongoError

from app.database.mongodb import get_collection
from app.services.video_aggregate import aggregate_video_frames


class AnalysisSource(Protocol):
    """Filename and size fields shared by image and video uploads."""

    filename: str
    size: int
    content_type: str


logger = logging.getLogger(__name__)

DATABASE_MESSAGE = "History is unavailable because MongoDB is not connected."


class HistoryUnavailable(Exception):
    """Raised when MongoDB cannot serve a history request."""


def to_iso(value: datetime | str | None) -> str:
    """Format a timestamp as a UTC ISO string ending in Z.

    Naive datetimes are treated as UTC. Missing values become an empty string.
    """
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, str):
        return value
    return ""


def _summarize_sections(results: dict) -> tuple[str | None, dict]:
    """Build compact counts from labels, faces, text, and moderation sections."""
    labels = results.get("labels") or {}
    faces = results.get("faces") or {}
    text = results.get("text") or {}
    moderation = results.get("moderation") or {}
    label_items = labels.get("labels") or []
    groups = labels.get("groups") or {}
    summary = {
        "label_count": int(labels.get("label_count") or 0) if results.get("labels") else 0,
        "face_count": int(faces.get("face_count") or 0) if results.get("faces") else 0,
        "text_count": int(text.get("line_count") or 0) if results.get("text") else 0,
        "animal_count": int(groups.get("animal") or 0),
        "vehicle_count": int(groups.get("vehicle") or 0),
        "object_count": int(groups.get("object") or 0),
        "other_count": int(groups.get("other") or 0),
        "top_labels": [item.get("name") for item in label_items[:5] if item.get("name")],
        "highest_moderation_confidence": moderation.get("highest_confidence") if results.get("moderation") else None,
    }
    status = moderation.get("status") if results.get("moderation") else None
    return status, summary


def summarize(results: dict) -> tuple[str | None, dict]:
    """Build the compact counts stored on every history document.

    List views use this summary so they do not have to load full Rekognition payloads.
    Moderation status is returned separately because it is stored as its own field.
    Video records roll every sampled frame into those same counts: unique labels,
    the busiest frame's face count, distinct text lines, and the strictest status.
    """
    frames = ((results.get("video") or {}).get("frames")) or []
    if frames:
        rolled = aggregate_video_frames(frames)
        return _summarize_sections(
            {
                "labels": rolled["labels"],
                "faces": rolled["faces"],
                "text": rolled["text"],
                "moderation": rolled["moderation"],
            }
        )
    return _summarize_sections(results)


def serialize_document(document: dict, include_results: bool = False) -> dict:
    """Turn a Mongo document into the JSON shape the API returns.

    The ObjectId becomes a string id. Full results are included only for the
    detail endpoint; list and stats queries omit them.
    """
    summary = document.get("summary") or {
        "label_count": 0,
        "face_count": 0,
        "text_count": 0,
        "top_labels": [],
        "highest_moderation_confidence": None,
    }
    payload = {
        "id": str(document["_id"]),
        "filename": document.get("filename") or "image",
        "file_size": int(document.get("file_size") or 0),
        "content_type": document.get("content_type"),
        "analysis_type": document.get("analysis_type") or "full",
        "moderation_status": document.get("moderation_status"),
        "summary": summary,
        "thresholds": document.get("thresholds"),
        "created_at": to_iso(document.get("created_at")),
        "persisted": True,
        "persist_error": None,
    }
    if include_results:
        payload["results"] = document.get("results") or {}
    return payload


def _insert(document: dict) -> tuple[str | None, str | None]:
    """Insert one document. A database failure returns an error string instead of raising.

    Analysis itself already succeeded, so the caller can still return the scores
    and tell the user they were not saved.
    """
    try:
        stored = dict(document)
        result = get_collection().insert_one(stored)
        return str(result.inserted_id), None
    except PyMongoError as exc:
        logger.error("Mongo insert failed (%s)", exc.__class__.__name__)
        return None, "The analysis finished, but it could not be saved because the database is unavailable."


def record_analysis(
    source: AnalysisSource,
    analysis_type: str,
    results: dict,
    thresholds: dict | None = None,
) -> dict:
    """Save an analysis and return the record the client should display.

    persisted is false when MongoDB rejected the insert. Image and video bytes
    are not part of the document.
    """
    created_at = datetime.now(timezone.utc)
    status, summary = summarize(results)
    document = {
        "filename": source.filename,
        "file_size": source.size,
        "content_type": source.content_type,
        "analysis_type": analysis_type,
        "moderation_status": status,
        "summary": summary,
        "thresholds": thresholds,
        "results": results,
        "created_at": created_at,
    }
    history_id, persist_error = _insert(document)
    return {
        "id": history_id,
        "filename": source.filename,
        "file_size": source.size,
        "content_type": source.content_type,
        "analysis_type": analysis_type,
        "moderation_status": status,
        "summary": summary,
        "thresholds": thresholds,
        "created_at": to_iso(created_at),
        "persisted": history_id is not None,
        "persist_error": persist_error,
        "results": results,
    }


def list_history(
    limit: int,
    skip: int,
    analysis_type: str | None = None,
    filename: str | None = None,
) -> dict:
    """Return a page of analyses, newest first, without the full results payload.

    Filename search is a case-insensitive substring match. The user text is
    escaped so it is treated as a literal, not a regular expression.
    """
    query: dict = {}
    if analysis_type:
        query["analysis_type"] = analysis_type
    if filename and filename.strip():
        query["filename"] = {"$regex": re.escape(filename.strip()), "$options": "i"}

    try:
        collection = get_collection()
        total = collection.count_documents(query)
        cursor = (
            collection.find(query, {"results": 0})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        items = [serialize_document(document) for document in cursor]
    except PyMongoError as exc:
        logger.error("Mongo list failed (%s)", exc.__class__.__name__)
        raise HistoryUnavailable(DATABASE_MESSAGE) from exc

    return {"items": items, "total": total, "limit": limit, "skip": skip}


def get_history_item(analysis_id: str) -> dict | None:
    """Load one analysis by id, including results. Invalid ids are re-raised."""
    try:
        document = get_collection().find_one({"_id": ObjectId(analysis_id)})
    except InvalidId:
        raise
    except PyMongoError as exc:
        logger.error("Mongo read failed (%s)", exc.__class__.__name__)
        raise HistoryUnavailable(DATABASE_MESSAGE) from exc
    if document is None:
        return None
    return serialize_document(document, include_results=True)


def delete_history_item(analysis_id: str) -> bool:
    """Delete one analysis. Returns whether a document was actually removed."""
    try:
        result = get_collection().delete_one({"_id": ObjectId(analysis_id)})
    except InvalidId:
        raise
    except PyMongoError as exc:
        logger.error("Mongo delete failed (%s)", exc.__class__.__name__)
        raise HistoryUnavailable(DATABASE_MESSAGE) from exc
    return result.deleted_count == 1


def get_stats() -> dict:
    """Aggregate dashboard totals and the five newest records.

    Counts that are missing on older documents are treated as zero.
    """
    try:
        collection = get_collection()
        grouped = list(
            collection.aggregate(
                [
                    {
                        "$group": {
                            "_id": None,
                            "total": {"$sum": 1},
                            "object_count": {"$sum": {"$ifNull": ["$summary.label_count", 0]}},
                            "face_count": {"$sum": {"$ifNull": ["$summary.face_count", 0]}},
                            "safe_count": {
                                "$sum": {"$cond": [{"$eq": ["$moderation_status", "safe"]}, 1, 0]}
                            },
                            "review_count": {
                                "$sum": {"$cond": [{"$eq": ["$moderation_status", "review"]}, 1, 0]}
                            },
                            "restricted_count": {
                                "$sum": {"$cond": [{"$eq": ["$moderation_status", "restricted"]}, 1, 0]}
                            },
                        }
                    }
                ]
            )
        )
        recent = (
            collection.find({}, {"results": 0}).sort("created_at", -1).limit(5)
        )
        recent_items = [serialize_document(document) for document in recent]
    except PyMongoError as exc:
        logger.error("Mongo stats failed (%s)", exc.__class__.__name__)
        raise HistoryUnavailable(DATABASE_MESSAGE) from exc

    base = grouped[0] if grouped else {}
    return {
        "total_analyses": int(base.get("total", 0)),
        "object_count": int(base.get("object_count", 0)),
        "face_count": int(base.get("face_count", 0)),
        "safe_count": int(base.get("safe_count", 0)),
        "review_count": int(base.get("review_count", 0)),
        "restricted_count": int(base.get("restricted_count", 0)),
        "recent": recent_items,
    }
