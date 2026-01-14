"""
Hearted Landing Page - FastAPI Application
"""
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.routes import api

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="Hearted",
    description="Save anything you love",
    docs_url=None,
    redoc_url=None,
)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Include API routes
app.include_router(api.router, prefix="/api")


@app.get("/", response_class=HTMLResponse)
async def home():
    """Serve the landing page."""
    return FileResponse(BASE_DIR / "index.html")


@app.get("/support.html", response_class=HTMLResponse)
async def support():
    """Serve the support page."""
    return FileResponse(BASE_DIR / "support.html")


@app.get("/privacy.html", response_class=HTMLResponse)
async def privacy():
    """Serve the privacy page."""
    return FileResponse(BASE_DIR / "privacy.html")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
