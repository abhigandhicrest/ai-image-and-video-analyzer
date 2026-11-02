"""HTTP error helpers that never include credentials or stack traces."""

from fastapi import HTTPException


def api_error(status_code: int, message: str, code: str) -> HTTPException:
    """Build an HTTP error whose detail is a stable message plus a machine code.

    Routes raise this so the frontend can show the message and branch on code
    without parsing free-form text.
    """
    return HTTPException(status_code=status_code, detail={"message": message, "code": code})
