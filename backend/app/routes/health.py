"""Health check. Reports configuration state without exposing secrets."""

from fastapi import APIRouter

from app.config.settings import get_settings
from app.database.mongodb import database_available
from app.models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Check backend health")
def health() -> HealthResponse:
    """Report API, MongoDB, and AWS configuration status.

    The response says whether credentials exist. It never returns the keys.
    """
    settings = get_settings()
    mongo_ok = database_available()
    return HealthResponse(
        status="ok" if mongo_ok else "degraded",
        api="ok",
        mongo="connected" if mongo_ok else "unavailable",
        aws_region=settings.aws_region,
        aws_credentials_configured=settings.aws_credentials_configured,
    )
