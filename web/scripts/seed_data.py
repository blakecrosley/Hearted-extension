"""
Seed database with sample engineering content for testing export API.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from app.core.database import async_session_maker
from app.models import Item, Tag


async def seed_data():
    """Create sample items and tags."""
    async with async_session_maker() as session:
        print("Creating tags...")

        # Create tags
        tags = {
            "programming": Tag(name="programming", auto_generated=False),
            "python": Tag(name="python", auto_generated=False),
            "fastapi": Tag(name="fastapi", auto_generated=False),
            "architecture": Tag(name="architecture", auto_generated=False),
            "systems": Tag(name="systems", auto_generated=False),
            "swift": Tag(name="swift", auto_generated=False),
            "ios": Tag(name="ios", auto_generated=False),
        }

        for tag in tags.values():
            session.add(tag)

        await session.flush()

        print("Creating sample items...")

        # Sample items
        items_data = [
            {
                "url": "https://x.com/pythondev/status/1001",
                "title": "Understanding async/await in Python",
                "description": "A comprehensive guide to asyncio patterns and best practices for modern Python development.",
                "content_type": "tweet",
                "source": "twitter",
                "source_id": "1001",
                "raw_data": '{"author_handle": "pythondev", "likes": 1523, "retweets": 342}',
                "tags": [tags["programming"], tags["python"]],
                "days_ago": 2,
            },
            {
                "url": "https://x.com/fastapi_user/status/1002",
                "title": "Building production-ready APIs with FastAPI",
                "description": "Learn how to structure FastAPI applications for scalability and maintainability.",
                "content_type": "tweet",
                "source": "twitter",
                "source_id": "1002",
                "raw_data": '{"author_handle": "fastapi_user", "likes": 892, "retweets": 156}',
                "tags": [tags["fastapi"], tags["python"], tags["architecture"]],
                "days_ago": 5,
            },
            {
                "url": "https://x.com/systems_eng/status/1003",
                "title": "Distributed systems patterns you should know",
                "description": "Event sourcing, CQRS, and saga patterns explained with practical examples.",
                "content_type": "tweet",
                "source": "twitter",
                "source_id": "1003",
                "raw_data": '{"author_handle": "systems_eng", "likes": 2341, "retweets": 678}',
                "tags": [tags["systems"], tags["architecture"]],
                "days_ago": 7,
            },
            {
                "url": "https://x.com/swiftui_dev/status/1004",
                "title": "SwiftUI navigation best practices for iOS 26",
                "description": "Migrating from NavigationView to NavigationStack and using modern patterns.",
                "content_type": "tweet",
                "source": "twitter",
                "source_id": "1004",
                "raw_data": '{"author_handle": "swiftui_dev", "likes": 1876, "retweets": 423}',
                "tags": [tags["swift"], tags["ios"]],
                "days_ago": 10,
            },
            {
                "url": "https://x.com/backend_guru/status/1005",
                "title": "Database indexing strategies",
                "description": "When to use B-tree vs Hash indexes, and how to optimize query performance.",
                "content_type": "tweet",
                "source": "twitter",
                "source_id": "1005",
                "raw_data": '{"author_handle": "backend_guru", "likes": 1234, "retweets": 289}',
                "tags": [tags["programming"], tags["architecture"]],
                "days_ago": 14,
            },
        ]

        for item_data in items_data:
            item = Item(
                url=item_data["url"],
                title=item_data["title"],
                description=item_data["description"],
                content_type=item_data["content_type"],
                source=item_data["source"],
                source_id=item_data["source_id"],
                raw_data=item_data["raw_data"],
                captured_at=datetime.now(timezone.utc) - timedelta(days=item_data["days_ago"]),
                is_favorite=True,
            )
            item.tags = item_data["tags"]
            session.add(item)

        await session.commit()
        print(f"✓ Created {len(items_data)} items with {len(tags)} tags")
        print("\nTest the API:")
        print("  curl -H 'X-API-Key: your-key' http://localhost:8000/api/export/engineering")


if __name__ == "__main__":
    asyncio.run(seed_data())
