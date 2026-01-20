"""
Export API routes for engineering content.
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from app.core.deps import DbSession, ApiKeyAuth
from app.schemas import EngineeringExportParams, EngineeringExportResponse
from app.services.export_service import (
    get_engineering_items,
    format_export_markdown,
    DEFAULT_ENGINEERING_TAGS,
)

router = APIRouter(prefix="/export", tags=["export"])


@router.get(
    "/engineering",
    response_class=PlainTextResponse,
    summary="Export engineering content",
    description="Export engineering-related items as markdown for Claude Code CLI consumption",
)
async def export_engineering_content(
    limit: int = Query(30, ge=1, le=100, description="Maximum items to return"),
    days_back: int | None = Query(None, ge=1, description="Only return items from last N days"),
    search: str | None = Query(None, description="Text search in title/description"),
    tags: str | None = Query(
        None,
        description="Comma-separated tag names (overrides default engineering tags)",
    ),
    db: DbSession = None,
    _auth: ApiKeyAuth = None,
) -> str:
    """
    Export engineering content as markdown.

    **Authentication:** Requires `X-API-Key` header

    **Default Engineering Tags:**
    - programming, architecture, systems, devops
    - swift, python, fastapi, ios, swiftui
    - backend, database, api, engineering
    - software, code, development, tech
    - infrastructure, scalability, performance

    **Example Request:**
    ```bash
    curl -H "X-API-Key: your-key" \
      "https://api.h3arted.com/api/export/engineering?limit=50&days_back=7"
    ```

    **Example Output:**
    ```markdown
    # Engineering Content Export

    Generated: 2026-01-17 12:00:00 UTC
    Items: 30

    ---

    ## @user - Jan 15, 2026
    Great thread on async patterns in Python...

    Source: https://x.com/user/status/123
    Tags: python, async, programming

    ---
    ```
    """
    # Build params
    params = EngineeringExportParams(
        limit=limit,
        days_back=days_back,
        search=search,
        tags=tags,
    )

    # Get items
    items = await get_engineering_items(db, params)

    # Format as markdown
    markdown = format_export_markdown(items, params)

    return markdown


@router.get(
    "/engineering/json",
    response_model=EngineeringExportResponse,
    summary="Export engineering content (JSON)",
    description="Same as /engineering but returns JSON with metadata",
)
async def export_engineering_content_json(
    limit: int = Query(30, ge=1, le=100),
    days_back: int | None = Query(None, ge=1),
    search: str | None = Query(None),
    tags: str | None = Query(None),
    db: DbSession = None,
    _auth: ApiKeyAuth = None,
) -> EngineeringExportResponse:
    """
    Export engineering content as JSON with metadata.

    **Authentication:** Requires `X-API-Key` header

    Returns the same markdown content plus metadata about the export.
    """
    # Build params
    params = EngineeringExportParams(
        limit=limit,
        days_back=days_back,
        search=search,
        tags=tags,
    )

    # Get items
    items = await get_engineering_items(db, params)

    # Format as markdown
    markdown = format_export_markdown(items, params)

    # Build response
    filters_applied = {
        "limit": params.limit,
        "days_back": params.days_back,
        "search": params.search,
        "tags": params.tags or f"default ({len(DEFAULT_ENGINEERING_TAGS)} tags)",
    }

    return EngineeringExportResponse(
        content=markdown,
        item_count=len(items),
        filters_applied=filters_applied,
    )


@router.get(
    "/engineering/tags",
    summary="List default engineering tags",
    description="Get the default list of engineering-related tags",
)
async def list_engineering_tags(_auth: ApiKeyAuth = None) -> dict:
    """
    List default engineering tags used for filtering.

    **Authentication:** Requires `X-API-Key` header
    """
    return {
        "tags": DEFAULT_ENGINEERING_TAGS,
        "count": len(DEFAULT_ENGINEERING_TAGS),
    }
