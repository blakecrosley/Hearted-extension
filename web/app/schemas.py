"""
Pydantic schemas for request/response validation.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class TagBase(BaseModel):
    name: str


class TagResponse(TagBase):
    id: int
    auto_generated: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ItemBase(BaseModel):
    url: str
    title: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    content_type: str
    source: str
    source_id: Optional[str] = None


class ItemResponse(ItemBase):
    id: int
    captured_at: datetime
    is_favorite: bool
    tags: list[TagResponse] = []

    model_config = ConfigDict(from_attributes=True)


class EngineeringExportParams(BaseModel):
    """Query parameters for engineering content export."""
    limit: int = Field(default=30, ge=1, le=100, description="Maximum items to return")
    days_back: Optional[int] = Field(default=None, ge=1, description="Only return items from last N days")
    search: Optional[str] = Field(default=None, description="Text search in title/description")
    tags: Optional[str] = Field(
        default=None,
        description="Comma-separated tag names to filter (overrides default engineering tags)",
    )


class EngineeringExportResponse(BaseModel):
    """Response for engineering content export."""
    content: str = Field(..., description="Markdown-formatted content for Claude Code")
    item_count: int = Field(..., description="Number of items included")
    filters_applied: dict = Field(..., description="Filters that were applied")
