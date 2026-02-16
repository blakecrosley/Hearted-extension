"""
SQLAlchemy models for Hearted content management.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, String, Text, Boolean, DateTime, UniqueConstraint, func, Table, Column, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# Association table for many-to-many relationship
item_tags = Table(
    "item_tags",
    Base.metadata,
    Column("item_id", Integer, ForeignKey("items.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_items_source_source_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(String(2048), index=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    content_type: Mapped[str] = mapped_column(String(50))  # 'tweet', 'article', 'video', etc.
    source: Mapped[str] = mapped_column(String(100))  # 'twitter', 'github', 'medium', etc.
    source_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    raw_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    tags: Mapped[list["Tag"]] = relationship(
        secondary=item_tags,
        back_populates="items",
        lazy="selectin",
    )


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    auto_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    items: Mapped[list["Item"]] = relationship(
        secondary=item_tags,
        back_populates="tags",
        lazy="selectin",
    )


class SmartCollection(Base):
    __tablename__ = "smart_collections"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criteria: Mapped[str] = mapped_column(Text)  # JSON string with filter criteria
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        onupdate=func.now(),
        nullable=True,
    )
