"""
Export API routes for content.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from app.core.deps import DbSession, ApiKeyAuth
from app.schemas import ExportParams, ExportResponse, ExportItemResponse
from app.services.export_service import (
    get_export_items,
    format_export_markdown,
    DEFAULT_ENGINEERING_TAGS,
    DEFAULT_DESIGN_TAGS,
    DEFAULT_INSPIRATION_TAGS,
    CATEGORY_TAG_MAP,
)

router = APIRouter(prefix="/export", tags=["export"])


@router.get(
    "/content",
    response_class=PlainTextResponse,
    summary="Export content as markdown",
    description="Export tagged content as markdown with pagination and category filtering",
)
async def export_content(
    limit: int = Query(30, ge=1, le=500, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    days_back: Optional[int] = Query(None, ge=1, description="Only return items from last N days"),
    since: Optional[datetime] = Query(None, description="Only items captured after this ISO datetime"),
    since_id: Optional[int] = Query(None, ge=1, description="Only items with id > this value"),
    search: Optional[str] = Query(None, description="Text search in title/description"),
    tags: Optional[str] = Query(None, description="Comma-separated tag names (overrides category defaults)"),
    category: str = Query("engineering", description="Category: engineering, design, inspiration, or all"),
    include_untagged: bool = Query(False, description="Include items without tags"),
    db: DbSession = None,
    _auth: ApiKeyAuth = None,
) -> str:
    """
    Export content as markdown with full pagination support.

    **Authentication:** Requires `X-API-Key` header

    **Categories:**
    - `engineering` - Programming, architecture, systems, iOS, Python, etc.
    - `design` - UI/UX, typography, branding, animation, etc.
    - `inspiration` - Creative coding, generative art, shaders, etc.
    - `all` - All tagged content regardless of category

    **Pagination:**
    - Use `offset` + `limit` for page-based navigation
    - Use `since_id` for cursor-based incremental sync
    - Use `since` for time-based incremental sync

    **Example:**
    ```bash
    curl -H "X-API-Key: your-key" \\
      "https://h3arted.com/api/export/content?category=engineering&limit=50&offset=0"
    ```
    """
    params = ExportParams(
        limit=limit,
        offset=offset,
        days_back=days_back,
        since=since,
        since_id=since_id,
        search=search,
        tags=tags,
        category=category,
        include_untagged=include_untagged,
    )

    items, total_count = await get_export_items(db, params)
    markdown = format_export_markdown(items, params, total_count)

    return markdown


@router.get(
    "/content/json",
    response_model=ExportResponse,
    summary="Export content as JSON",
    description="Same filters as /content but returns structured JSON with pagination metadata",
)
async def export_content_json(
    limit: int = Query(30, ge=1, le=500),
    offset: int = Query(0, ge=0),
    days_back: Optional[int] = Query(None, ge=1),
    since: Optional[datetime] = Query(None),
    since_id: Optional[int] = Query(None, ge=1),
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    category: str = Query("engineering"),
    include_untagged: bool = Query(False),
    db: DbSession = None,
    _auth: ApiKeyAuth = None,
) -> ExportResponse:
    """
    Export content as JSON with full pagination metadata.

    **Authentication:** Requires `X-API-Key` header

    Returns structured items with total_count, has_more, and pagination info.
    """
    params = ExportParams(
        limit=limit,
        offset=offset,
        days_back=days_back,
        since=since,
        since_id=since_id,
        search=search,
        tags=tags,
        category=category,
        include_untagged=include_untagged,
    )

    items, total_count = await get_export_items(db, params)

    # Build structured item responses
    item_responses = [
        ExportItemResponse(
            id=item.id,
            url=item.url,
            title=item.title,
            description=item.description,
            source=item.source,
            captured_at=item.captured_at,
            tags=[tag.name for tag in item.tags] if item.tags else [],
        )
        for item in items
    ]

    # Build filters dict
    filters_applied = {
        "category": params.category,
        "limit": params.limit,
        "offset": params.offset,
    }
    if params.days_back:
        filters_applied["days_back"] = params.days_back
    if params.since:
        filters_applied["since"] = params.since.isoformat()
    if params.since_id:
        filters_applied["since_id"] = params.since_id
    if params.search:
        filters_applied["search"] = params.search
    if params.tags:
        filters_applied["tags"] = params.tags
    if params.include_untagged:
        filters_applied["include_untagged"] = True

    has_more = (params.offset + len(items)) < total_count

    return ExportResponse(
        items=item_responses,
        total_count=total_count,
        item_count=len(items),
        offset=params.offset,
        limit=params.limit,
        has_more=has_more,
        filters_applied=filters_applied,
    )


# --- Legacy endpoints (backward compatible) ---


@router.get(
    "/engineering",
    response_class=PlainTextResponse,
    summary="Export engineering content (legacy)",
    description="Legacy endpoint - use /export/content?category=engineering instead",
)
async def export_engineering_content(
    limit: int = Query(30, ge=1, le=500, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    days_back: Optional[int] = Query(None, ge=1, description="Only return items from last N days"),
    since: Optional[datetime] = Query(None, description="Only items captured after this ISO datetime"),
    since_id: Optional[int] = Query(None, ge=1, description="Only items with id > this value"),
    search: Optional[str] = Query(None, description="Text search in title/description"),
    tags: Optional[str] = Query(None, description="Comma-separated tag names"),
    include_untagged: bool = Query(False, description="Include items without tags"),
    db: DbSession = None,
    _auth: ApiKeyAuth = None,
) -> str:
    """Legacy engineering export - redirects to /content?category=engineering."""
    params = ExportParams(
        limit=limit,
        offset=offset,
        days_back=days_back,
        since=since,
        since_id=since_id,
        search=search,
        tags=tags,
        category="engineering",
        include_untagged=include_untagged,
    )

    items, total_count = await get_export_items(db, params)
    markdown = format_export_markdown(items, params, total_count)

    return markdown


@router.get(
    "/engineering/json",
    response_model=ExportResponse,
    summary="Export engineering content JSON (legacy)",
    description="Legacy endpoint - use /export/content/json?category=engineering instead",
)
async def export_engineering_content_json(
    limit: int = Query(30, ge=1, le=500),
    offset: int = Query(0, ge=0),
    days_back: Optional[int] = Query(None, ge=1),
    since: Optional[datetime] = Query(None),
    since_id: Optional[int] = Query(None, ge=1),
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    include_untagged: bool = Query(False),
    db: DbSession = None,
    _auth: ApiKeyAuth = None,
) -> ExportResponse:
    """Legacy JSON endpoint."""
    params = ExportParams(
        limit=limit,
        offset=offset,
        days_back=days_back,
        since=since,
        since_id=since_id,
        search=search,
        tags=tags,
        category="engineering",
        include_untagged=include_untagged,
    )

    items, total_count = await get_export_items(db, params)

    item_responses = [
        ExportItemResponse(
            id=item.id,
            url=item.url,
            title=item.title,
            description=item.description,
            source=item.source,
            captured_at=item.captured_at,
            tags=[tag.name for tag in item.tags] if item.tags else [],
        )
        for item in items
    ]

    filters_applied = {
        "category": "engineering",
        "limit": params.limit,
        "offset": params.offset,
    }
    if params.days_back:
        filters_applied["days_back"] = params.days_back
    if params.search:
        filters_applied["search"] = params.search
    if params.tags:
        filters_applied["tags"] = params.tags

    has_more = (params.offset + len(items)) < total_count

    return ExportResponse(
        items=item_responses,
        total_count=total_count,
        item_count=len(items),
        offset=params.offset,
        limit=params.limit,
        has_more=has_more,
        filters_applied=filters_applied,
    )


@router.get(
    "/engineering/tags",
    summary="List default engineering tags",
    description="Get the default list of engineering-related tags",
)
async def list_engineering_tags(_auth: ApiKeyAuth = None) -> dict:
    """List default engineering tags used for filtering."""
    return {
        "tags": DEFAULT_ENGINEERING_TAGS,
        "count": len(DEFAULT_ENGINEERING_TAGS),
    }


@router.get(
    "/tags",
    summary="List all category tag sets",
    description="Get the default tag lists for all categories",
)
async def list_all_tags(_auth: ApiKeyAuth = None) -> dict:
    """List tag sets for all categories."""
    return {
        "categories": {
            name: {"tags": tags, "count": len(tags)}
            for name, tags in CATEGORY_TAG_MAP.items()
        },
    }
