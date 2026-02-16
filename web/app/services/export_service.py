"""
Service layer for content export operations.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item, Tag
from app.schemas import ExportParams


# Tag sets by category
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

DEFAULT_DESIGN_TAGS = [
    "design",
    "ui",
    "ux",
    "typography",
    "branding",
    "visual",
    "illustration",
    "animation",
    "motion",
    "color",
    "layout",
    "figma",
    "css",
    "frontend",
    "interaction",
    "graphic-design",
    "design-systems",
    "art-direction",
]

DEFAULT_INSPIRATION_TAGS = [
    "inspiration",
    "creative",
    "art",
    "photography",
    "generative",
    "3d",
    "shader",
    "webgl",
    "threejs",
    "p5js",
    "creative-coding",
    "procedural",
    "visualization",
    "data-viz",
    "experimental",
]

CATEGORY_TAG_MAP = {
    "engineering": DEFAULT_ENGINEERING_TAGS,
    "design": DEFAULT_DESIGN_TAGS,
    "inspiration": DEFAULT_INSPIRATION_TAGS,
}

CATEGORY_TITLES = {
    "engineering": "Engineering Content Export",
    "design": "Design Content Export",
    "inspiration": "Inspiration Content Export",
    "all": "All Content Export",
}


def _get_tags_for_category(category: str) -> list[str]:
    """Get the default tag list for a category."""
    return CATEGORY_TAG_MAP.get(category, DEFAULT_ENGINEERING_TAGS)


def _build_base_query(params: ExportParams) -> tuple:
    """Build the base query and count query with shared filters.

    Returns (items_query, count_query) tuple.
    """
    query = select(Item).distinct()
    count_query = select(func.count(Item.id.distinct()))

    # Tag filtering
    if params.include_untagged:
        # LEFT JOIN to include untagged items
        query = query.outerjoin(Item.tags)
        count_query = count_query.outerjoin(Item.tags)
    elif params.tags:
        tag_names = [t.strip() for t in params.tags.split(",")]
        query = query.join(Item.tags).where(Tag.name.in_(tag_names))
        count_query = count_query.join(Item.tags).where(Tag.name.in_(tag_names))
    elif params.category != "all":
        category_tags = _get_tags_for_category(params.category)
        query = query.join(Item.tags).where(Tag.name.in_(category_tags))
        count_query = count_query.join(Item.tags).where(Tag.name.in_(category_tags))
    # category=all with no tags filter: no join needed, return all items

    # Date filtering - since takes precedence over days_back
    if params.since:
        query = query.where(Item.captured_at >= params.since)
        count_query = count_query.where(Item.captured_at >= params.since)
    elif params.days_back:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=params.days_back)
        query = query.where(Item.captured_at >= cutoff_date)
        count_query = count_query.where(Item.captured_at >= cutoff_date)

    # since_id filtering (cursor-based pagination)
    if params.since_id:
        query = query.where(Item.id > params.since_id)
        count_query = count_query.where(Item.id > params.since_id)

    # Text search
    if params.search:
        search_term = f"%{params.search}%"
        search_filter = or_(
            Item.title.ilike(search_term),
            Item.description.ilike(search_term),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    return query, count_query


async def get_export_items(
    db: AsyncSession,
    params: ExportParams,
) -> tuple[list[Item], int]:
    """
    Query items with filtering and return items + total count.

    Returns:
        Tuple of (items list, total matching count)
    """
    query, count_query = _build_base_query(params)

    # Get total count before pagination
    count_result = await db.execute(count_query)
    total_count = count_result.scalar() or 0

    # Apply ordering, offset, and limit
    query = query.order_by(Item.captured_at.desc())
    query = query.offset(params.offset)
    query = query.limit(params.limit)

    # Execute items query
    result = await db.execute(query)
    items = list(result.scalars().all())

    return items, total_count


# Backward compat alias
async def get_engineering_items(
    db: AsyncSession,
    params: ExportParams,
) -> list[Item]:
    """Legacy wrapper - returns items only (no total count)."""
    items, _ = await get_export_items(db, params)
    return items


def format_item_as_markdown(item: Item) -> str:
    """
    Format a single item as markdown for Claude Code context.
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


def format_export_markdown(
    items: list[Item],
    params: ExportParams,
    total_count: int = 0,
) -> str:
    """
    Format multiple items as markdown export.
    """
    lines = []

    # Category-aware header
    title = CATEGORY_TITLES.get(params.category, "Content Export")
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    lines.append(f"Items: {len(items)} of {total_count} total")
    lines.append("")

    # Pagination info
    if params.offset > 0 or total_count > len(items):
        lines.append(f"**Page:** offset={params.offset}, limit={params.limit}")
        has_more = (params.offset + len(items)) < total_count
        if has_more:
            next_offset = params.offset + params.limit
            lines.append(f"**Next page:** offset={next_offset}")
        lines.append("")

    # Filters applied
    filters = []
    if params.tags:
        filters.append(f"Tags: {params.tags}")
    if params.days_back:
        filters.append(f"Last {params.days_back} days")
    if params.since:
        filters.append(f"Since: {params.since.isoformat()}")
    if params.since_id:
        filters.append(f"Since ID: {params.since_id}")
    if params.search:
        filters.append(f"Search: '{params.search}'")
    if params.include_untagged:
        filters.append("Including untagged items")

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
