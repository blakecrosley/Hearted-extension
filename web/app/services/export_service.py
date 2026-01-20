"""
Service layer for content export operations.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, or_, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item, Tag
from app.schemas import EngineeringExportParams


# Default engineering-related tags
DEFAULT_ENGINEERING_TAGS = [
    "programming",
    "architecture",
    "systems",
    "devops",
    "swift",
    "python",
    "fastapi",
    "ios",
    "swiftui",
    "backend",
    "database",
    "api",
    "engineering",
    "software",
    "code",
    "development",
    "tech",
    "infrastructure",
    "scalability",
    "performance",
]


async def get_engineering_items(
    db: AsyncSession,
    params: EngineeringExportParams,
) -> list[Item]:
    """
    Query engineering-related items with filtering.

    Args:
        db: Database session
        params: Query parameters (limit, days_back, search, tags)

    Returns:
        List of Item objects matching criteria
    """
    # Start with base query
    query = select(Item).distinct()

    # Tag filtering
    tag_names = (
        params.tags.split(",") if params.tags
        else DEFAULT_ENGINEERING_TAGS
    )

    # Join with tags and filter
    query = query.join(Item.tags).where(Tag.name.in_(tag_names))

    # Date filtering
    if params.days_back:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=params.days_back)
        query = query.where(Item.captured_at >= cutoff_date)

    # Text search
    if params.search:
        search_term = f"%{params.search}%"
        query = query.where(
            or_(
                Item.title.ilike(search_term),
                Item.description.ilike(search_term),
            )
        )

    # Order by most recent first
    query = query.order_by(Item.captured_at.desc())

    # Limit results
    query = query.limit(params.limit)

    # Execute query
    result = await db.execute(query)
    items = list(result.scalars().all())

    return items


def format_item_as_markdown(item: Item) -> str:
    """
    Format a single item as markdown for Claude Code context.

    Args:
        item: Item to format

    Returns:
        Markdown string for the item
    """
    # Parse raw_data for author info if available
    author_handle = "unknown"
    if item.raw_data:
        try:
            raw = json.loads(item.raw_data)
            author_handle = raw.get("author_handle") or raw.get("username") or "unknown"
        except json.JSONDecodeError:
            pass

    # Format date
    date_str = item.captured_at.strftime("%b %d, %Y")

    # Build markdown
    lines = []
    lines.append(f"## @{author_handle} - {date_str}")

    # Content
    if item.title:
        lines.append(item.title)
    if item.description:
        lines.append("")
        lines.append(item.description)

    lines.append("")
    lines.append(f"Source: {item.url}")

    # Tags
    if item.tags:
        tag_names = [tag.name for tag in item.tags]
        lines.append(f"Tags: {', '.join(tag_names)}")

    lines.append("")
    lines.append("---")

    return "\n".join(lines)


def format_export_markdown(items: list[Item], params: EngineeringExportParams) -> str:
    """
    Format multiple items as markdown export.

    Args:
        items: List of items to export
        params: Query parameters used

    Returns:
        Complete markdown document
    """
    lines = []

    # Header
    lines.append("# Engineering Content Export")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    lines.append(f"Items: {len(items)}")
    lines.append("")

    # Filters applied
    filters = []
    if params.tags:
        filters.append(f"Tags: {params.tags}")
    if params.days_back:
        filters.append(f"Last {params.days_back} days")
    if params.search:
        filters.append(f"Search: '{params.search}'")

    if filters:
        lines.append("**Filters:** " + " | ".join(filters))
        lines.append("")

    lines.append("---")
    lines.append("")

    # Items
    for item in items:
        lines.append(format_item_as_markdown(item))
        lines.append("")

    return "\n".join(lines)
