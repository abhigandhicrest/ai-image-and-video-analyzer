"""Environment-backed settings. Secrets stay on the server."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env sits two levels above this file (app/config/settings.py).
BACKEND_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    """Values loaded from the environment or backend/.env.

    Empty AWS keys are allowed so the process can still use the default
    AWS credential chain (instance role, shared credentials file, and so on).
    """

    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-south-1"

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "image_analyzer"

    # Comma-separated browser origins allowed to call the API.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Upload ceiling and the default confidence cutoffs used by analysis.
    max_upload_bytes: int = Field(default=5 * 1024 * 1024, gt=0)
    # Short clips stay on the server. Frames are sampled locally; nothing is uploaded to S3.
    max_video_bytes: int = Field(default=50 * 1024 * 1024, gt=0)
    max_video_seconds: int = Field(default=60, gt=0, le=600)
    video_sample_frames: int = Field(default=6, ge=1, le=8)
    moderation_review_threshold: float = Field(default=50, ge=0, le=100)
    moderation_restricted_threshold: float = Field(default=80, ge=0, le=100)
    label_min_confidence: float = Field(default=50, ge=0, le=100)

    model_config = SettingsConfigDict(
        env_file=ENV_FILE if ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator(
        "aws_access_key_id",
        "aws_secret_access_key",
        "aws_region",
        "mongo_uri",
        "mongo_db_name",
        "cors_origins",
        mode="before",
    )
    @classmethod
    def strip_text(cls, value: object) -> object:
        """Trim accidental whitespace from string settings."""
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def check_thresholds(self) -> "Settings":
        """Reject a review cutoff that is stricter than the restricted cutoff."""
        if self.moderation_review_threshold > self.moderation_restricted_threshold:
            raise ValueError(
                "MODERATION_REVIEW_THRESHOLD cannot exceed MODERATION_RESTRICTED_THRESHOLD."
            )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        """Split the comma-separated origin string into a list for CORS middleware."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def aws_credentials_configured(self) -> bool:
        """True only when both the access key and secret are present in settings."""
        return bool(self.aws_access_key_id and self.aws_secret_access_key)


@lru_cache
def get_settings() -> Settings:
    """Return one cached Settings instance for the process lifetime."""
    return Settings()
