# Engineering Content Export API Setup

## Overview

Production-ready FastAPI endpoint for exporting engineering content as markdown for Claude Code CLI consumption.

## Architecture

```
app/
├── models.py              # SQLAlchemy models (Item, Tag, SmartCollection)
├── schemas.py             # Pydantic request/response schemas
├── core/
│   ├── database.py        # Async database engine and session
│   └── deps.py            # Dependency injection (auth, db)
├── services/
│   └── export_service.py  # Business logic for export
└── routes/
    └── export.py          # API endpoint handlers
```

## Database Setup

### 1. Install Dependencies

```bash
cd web
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string (asyncpg driver)
- `HEARTED_API_KEY`: API key for authentication

### 3. Create Database

```bash
createdb hearted
```

### 4. Run Migrations

```bash
# Initialize Alembic (first time only)
alembic init alembic

# Create initial migration
alembic revision --autogenerate -m "Initial schema"

# Apply migrations
alembic upgrade head
```

## API Usage

### Authentication

All endpoints require `X-API-Key` header:

```bash
export HEARTED_API_KEY="your-secure-key"
curl -H "X-API-Key: $HEARTED_API_KEY" \
  "http://localhost:8000/api/export/engineering"
```

### Endpoints

#### 1. Export Engineering Content (Markdown)

```bash
GET /api/export/engineering
```

**Query Parameters:**
- `limit` (int, 1-100): Maximum items to return (default: 30)
- `days_back` (int): Only return items from last N days (optional)
- `search` (str): Text search in title/description (optional)
- `tags` (str): Comma-separated tag names (optional, overrides defaults)

**Example:**
```bash
curl -H "X-API-Key: $HEARTED_API_KEY" \
  "http://localhost:8000/api/export/engineering?limit=50&days_back=7&search=async"
```

**Response:** Plain text markdown

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

#### 2. Export Engineering Content (JSON)

```bash
GET /api/export/engineering/json
```

Same parameters as above, returns JSON with metadata:

```json
{
  "content": "# Engineering Content Export\n...",
  "item_count": 30,
  "filters_applied": {
    "limit": 30,
    "days_back": 7,
    "search": "async",
    "tags": "default (20 tags)"
  }
}
```

#### 3. List Engineering Tags

```bash
GET /api/export/engineering/tags
```

Returns the default list of engineering tags:

```json
{
  "tags": ["programming", "architecture", "systems", ...],
  "count": 20
}
```

## Default Engineering Tags

The following tags are used by default:

- programming, architecture, systems, devops
- swift, python, fastapi, ios, swiftui
- backend, database, api, engineering
- software, code, development, tech
- infrastructure, scalability, performance

Override with the `tags` query parameter.

## Claude Code Integration

### Save to Context File

```bash
# Export and save
curl -H "X-API-Key: $HEARTED_API_KEY" \
  "https://api.h3arted.com/api/export/engineering?days_back=7" \
  > engineering-context.md

# Use in Claude Code
claude --context engineering-context.md "Review these engineering insights"
```

### Direct Pipe

```bash
curl -H "X-API-Key: $HEARTED_API_KEY" \
  "https://api.h3arted.com/api/export/engineering?limit=50" | \
  claude "Summarize the top engineering trends from my saved content"
```

## Testing

### Run FastAPI Server

```bash
cd web
uvicorn app.main:app --reload
```

### Test Endpoints

```bash
# Health check
curl http://localhost:8000/health

# Export (requires API key and data)
curl -H "X-API-Key: test-key" \
  "http://localhost:8000/api/export/engineering/tags"
```

### View API Docs

Open http://localhost:8000/api/docs

## Data Population

### Add Sample Data

```python
# scripts/seed_data.py
import asyncio
from datetime import datetime, timezone
from app.core.database import async_session_maker
from app.models import Item, Tag

async def seed_data():
    async with async_session_maker() as session:
        # Create tags
        tags = [
            Tag(name="programming", auto_generated=False),
            Tag(name="python", auto_generated=False),
            Tag(name="fastapi", auto_generated=False),
        ]
        session.add_all(tags)
        await session.flush()

        # Create item
        item = Item(
            url="https://x.com/user/status/123",
            title="Great thread on async patterns",
            description="Comprehensive guide to asyncio in Python",
            content_type="tweet",
            source="twitter",
            source_id="123",
            raw_data='{"author_handle": "pythondev"}',
            captured_at=datetime.now(timezone.utc),
            is_favorite=True,
        )
        item.tags = tags
        session.add(item)

        await session.commit()
        print("Seed data created")

if __name__ == "__main__":
    asyncio.run(seed_data())
```

Run:
```bash
python scripts/seed_data.py
```

## Production Deployment

### Environment Variables

Set these in your production environment:
- `DATABASE_URL`: Production PostgreSQL URL
- `HEARTED_API_KEY`: Secure, random API key (use `openssl rand -hex 32`)
- `DEBUG`: `false`

### Security Checklist

- [ ] Use HTTPS in production
- [ ] Rotate API keys regularly
- [ ] Set up database backups
- [ ] Configure CORS appropriately
- [ ] Enable rate limiting (future enhancement)
- [ ] Monitor API usage

## Future Enhancements

- [ ] Rate limiting per API key
- [ ] Multiple export formats (JSON, CSV)
- [ ] Webhook notifications for new content
- [ ] Advanced filtering (date ranges, multiple conditions)
- [ ] Export to RSS feed
- [ ] Scheduled exports

---

## File Reference

**Models:** `/Users/blakecrosley/Projects/Hearted/web/app/models.py`
**Schemas:** `/Users/blakecrosley/Projects/Hearted/web/app/schemas.py`
**Database:** `/Users/blakecrosley/Projects/Hearted/web/app/core/database.py`
**Dependencies:** `/Users/blakecrosley/Projects/Hearted/web/app/core/deps.py`
**Service:** `/Users/blakecrosley/Projects/Hearted/web/app/services/export_service.py`
**Routes:** `/Users/blakecrosley/Projects/Hearted/web/app/routes/export.py`
