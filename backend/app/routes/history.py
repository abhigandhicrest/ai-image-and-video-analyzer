"""Analysis history stored in MongoDB."""

from bson.errors import InvalidId
from fastapi import APIRouter, Query, Response

from app.errors import api_error
from app.models.schemas import AnalysisRecord, HistoryList, StatsResponse
from app.services.history_service import (
    HistoryUnavailable,
    delete_history_item,
    get_history_item,
    get_stats,
    list_history,
)

router = APIRouter(tags=["history"])


def _database_error(exc: HistoryUnavailable):
    """Map a database outage to HTTP 503 with a stable error code."""
    return api_error(503, str(exc), "database_unavailable")


@router.get("/stats", response_model=StatsResponse, summary="Dashboard statistics")
def stats() -> dict:
    """Return aggregate counts and the five most recent analyses."""
    try:
        return get_stats()
    except HistoryUnavailable as exc:
        raise _database_error(exc) from exc


@router.get("/history", response_model=HistoryList, summary="List previous analyses")
def history(
    limit: int = Query(default=10, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    analysis_type: str | None = Query(default=None, pattern="^(full|labels|faces|text|moderation|video)$"),
    filename: str | None = Query(default=None, max_length=120),
) -> dict:
    """List saved analyses, newest first, with optional type and filename filters."""
    try:
        return list_history(limit=limit, skip=skip, analysis_type=analysis_type, filename=filename)
    except HistoryUnavailable as exc:
        raise _database_error(exc) from exc


@router.get("/history/{analysis_id}", response_model=AnalysisRecord, summary="Retrieve one analysis")
def history_detail(analysis_id: str) -> dict:
    """Return one saved analysis, including the full Rekognition results."""
    try:
        item = get_history_item(analysis_id)
    except InvalidId as exc:
        raise api_error(400, "That analysis id is not valid.", "invalid_id") from exc
    except HistoryUnavailable as exc:
        raise _database_error(exc) from exc
    if item is None:
        raise api_error(404, "That analysis record was not found.", "not_found")
    return item


@router.delete("/history/{analysis_id}", status_code=204, summary="Delete one analysis")
def history_delete(analysis_id: str) -> Response:
    """Delete one analysis document. The response body is empty on success."""
    try:
        deleted = delete_history_item(analysis_id)
    except InvalidId as exc:
        raise api_error(400, "That analysis id is not valid.", "invalid_id") from exc
    except HistoryUnavailable as exc:
        raise _database_error(exc) from exc
    if not deleted:
        raise api_error(404, "That analysis record was not found.", "not_found")
    return Response(status_code=204)
