"""MongoDB client. Connections are created on demand so the API can boot offline."""

import logging

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import PyMongoError

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# Shared client. None until the first database call succeeds in creating it.
_client: MongoClient | None = None


def get_client() -> MongoClient:
    """Return the process-wide Mongo client, creating it on first use.

    Short timeouts keep health checks and history calls from hanging when
    MongoDB is not running.
    """
    global _client
    if _client is None:
        settings = get_settings()
        _client = MongoClient(
            settings.mongo_uri,
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
        )
    return _client


def get_database() -> Database:
    """Return the configured application database."""
    return get_client()[get_settings().mongo_db_name]


def get_collection() -> Collection:
    """Return the collection that stores analysis documents."""
    return get_database()["analyses"]


def ping() -> None:
    """Raise if the server does not answer a ping."""
    get_client().admin.command("ping")


def ensure_indexes() -> None:
    """Create the indexes used by history listing and type filters."""
    collection = get_collection()
    collection.create_index([("created_at", -1)])
    collection.create_index("analysis_type")


def close_client() -> None:
    """Close the shared client during application shutdown."""
    global _client
    if _client is not None:
        _client.close()
        _client = None


def database_available() -> bool:
    """Report whether MongoDB answered a ping, without raising to the caller."""
    try:
        ping()
        return True
    except PyMongoError as exc:
        logger.warning("MongoDB ping failed (%s)", exc.__class__.__name__)
        return False
