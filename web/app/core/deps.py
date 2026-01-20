"""
Dependency injection for FastAPI routes.
"""
import os
from typing import Annotated

from fastapi import Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

# API Key from environment
API_KEY = os.getenv("HEARTED_API_KEY", "")

if not API_KEY:
    import logging
    logging.warning("HEARTED_API_KEY not set - API key authentication will fail")


async def require_api_key(x_api_key: Annotated[str, Header()]) -> bool:
    """
    Validate API key from X-API-Key header.
    Raises 401 if invalid or missing.
    """
    if not API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error",
        )

    if x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    return True


# Type aliases for cleaner route signatures
DbSession = Annotated[AsyncSession, Depends(get_db)]
ApiKeyAuth = Annotated[bool, Depends(require_api_key)]
