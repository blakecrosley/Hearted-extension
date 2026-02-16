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


class ExportParams(BaseModel):
    """Query parameters for content export."""
    limit: int = Field(default=30, ge=1, le=500, description="Maximum items to return")
    offset: int = Field(default=0, ge=0, description="Number of items to skip for pagination")
    days_back: Optional[int] = Field(default=None, ge=1, description="Only return items from last N days")
    since: Optional[datetime] = Field(default=None, description="Only return items captured after this ISO datetime")
    since_id: Optional[int] = Field(default=None, ge=1, description="Only return items with id greater than this value")
    search: Optional[str] = Field(default=None, description="Text search in title/description")
    tags: Optional[str] = Field(
        default=None,
        description="Comma-separated tag names to filter (overrides default category tags)",
    )
    category: str = Field(
        default="engineering",
        description="Content category: engineering, design, inspiration, or all",
    )
    include_untagged: bool = Field(default=False, description="Include items without any tags")


# Keep backward compat alias
EngineeringExportParams = ExportParams


class ExportItemResponse(BaseModel):
    """Individual item in JSON export."""
    id: int
    url: str
    title: str
    description: Optional[str] = None
    source: str
    captured_at: datetime
    tags: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class ExportResponse(BaseModel):
    """Response for content export with pagination metadata."""
    items: list[ExportItemResponse] = Field(..., description="Exported items")
    total_count: int = Field(..., description="Total matching items (before limit/offset)")
    item_count: int = Field(..., description="Number of items in this response")
    offset: int = Field(..., description="Current offset")
    limit: int = Field(..., description="Limit used")
    has_more: bool = Field(..., description="Whether more items exist beyond this page")
    filters_applied: dict = Field(..., description="Filters that were applied")


# Keep backward compat alias
EngineeringExportResponse = ExportResponse
