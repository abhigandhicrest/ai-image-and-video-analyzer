"""FastAPI application entrypoint.

Builds the API, wires CORS and security headers, and mounts the
health, analyze, and history routers under /api.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError

from app.config.settings import get_settings
from app.database.mongodb import close_client, ensure_indexes
from app.routes import analyze, health, history

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Prepare MongoDB indexes on startup and close the client on shutdown.

    A missing database must not stop the API from booting, so connection
    errors are logged and the process continues.
    """
    try:
        ensure_indexes()
        logger.info("MongoDB indexes are ready.")
    except PyMongoError as exc:
        logger.warning("MongoDB is unavailable at startup (%s).", exc.__class__.__name__)
    yield
    close_client()


def _validation_message(exc: RequestValidationError) -> str:
    """Turn FastAPI validation errors into one readable sentence.

    A missing upload is reported as a file prompt. Other field errors keep
    the field name so the client can show what failed.
    """
    errors = exc.errors()
    for error in errors:
        location = error.get("loc") or ()
        if location and location[-1] == "file":
            if request.url.path.rstrip("/").endswith("/analyze/video"):
                return "Choose a video file before analyzing."
            return "Choose an image file before analyzing."
    parts = []
    for error in errors:
        # Drop framework location prefixes; keep the actual field name.
        location = [str(part) for part in error.get("loc") or () if part not in {"body", "query"}]
        message = error.get("msg") or "Invalid value."
        if location:
            parts.append(f"{' '.join(location)}: {message}")
        else:
            parts.append(message)
    return " ".join(parts) or "The request could not be validated."


def create_app() -> FastAPI:
    """Create the configured FastAPI application."""
    settings = get_settings()
    application = FastAPI(
        title="AI Image Analyzer",
        version="1.0.0",
        summary="Analyze images and short videos with AWS Rekognition.",
        lifespan=lifespan,
    )

    # Browser clients on the Vite dev server need these origins.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    @application.middleware("http")
    async def security_headers(request: Request, call_next):
        """Block MIME sniffing and stop browsers from caching API responses."""
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    @application.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        """Return validation failures in the same {message, code} shape as other errors."""
        return JSONResponse(
            status_code=422,
            content={"detail": {"message": _validation_message(exc), "code": "validation_error"}},
        )

    @application.get("/", include_in_schema=False)
    def root() -> dict:
        """Point visitors at the docs and health check."""
        return {
            "service": "AI Image Analyzer",
            "docs": "/docs",
            "health": "/api/health",
        }

    application.include_router(health.router, prefix="/api")
    application.include_router(analyze.router, prefix="/api")
    application.include_router(history.router, prefix="/api")
    return application


# Module-level app used by uvicorn (uvicorn app.main:app).
app = create_app()
