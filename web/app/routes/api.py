"""
API routes for early access signup.
"""
import os
import logging
from pathlib import Path

import resend
from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import HTMLResponse
from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

router = APIRouter()

# Resend configuration
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("HEARTED_FROM_EMAIL", "hello@mail.h3arted.com")
TO_EMAIL = os.getenv("HEARTED_TO_EMAIL", "blake@941apps.com")

# Email templates
TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "emails"
email_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)


def _render_signup_email(email: str) -> tuple[str, str]:
    """Render HTML and plain text email templates for signup notification."""
    context = {"email": email}

    html_template = email_env.get_template("signup_notification.html")
    text_template = email_env.get_template("signup_notification.txt")

    return html_template.render(**context), text_template.render(**context)


@router.post("/request-access", response_class=HTMLResponse)
async def request_access(email: str = Form(...)):
    """
    Handle early access request.
    Sends notification email and returns HTML fragment for HTMX.
    """
    # Basic email validation
    if not email or "@" not in email or "." not in email:
        return _error_response("Please enter a valid email address.")

    # Render email templates
    email_html, email_text = _render_signup_email(email)

    # Send notification via Resend
    if not RESEND_API_KEY:
        logger.error("RESEND_API_KEY not configured")
        return _error_response("Server error. Please try again.")

    try:
        resend.api_key = RESEND_API_KEY
        print(f"[HEARTED] Sending email from: {FROM_EMAIL}")
        print(f"[HEARTED] API key (first 10 chars): {RESEND_API_KEY[:10]}...")

        result = resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [TO_EMAIL],
            "subject": f"Hearted Early Access Request: {email}",
            "html": email_html,
            "text": email_text,
            "reply_to": email,
        })

        email_id = result.get("id") if isinstance(result, dict) else None
        if not email_id:
            logger.error(f"Resend returned unexpected response: {result}")
            return _error_response("Failed to submit. Please try again.")

        print(f"[HEARTED] Access request received: {email} (email_id: {email_id})")
        return _success_response()

    except Exception as e:
        print(f"[HEARTED] Error type: {type(e).__name__}")
        print(f"[HEARTED] Error details: {e}")
        logger.error(f"Failed to send signup email: {e}")
        return _error_response("Failed to submit. Please try again.")


def _success_response() -> str:
    """Return success HTML fragment."""
    return """
    <div class="access-success">
        <i class="bi bi-check-circle-fill"></i>
        <span>You're on the list</span>
        <p>We'll reach out when early access opens.</p>
    </div>
    """


def _error_response(message: str) -> str:
    """Return error HTML fragment."""
    return f"""
    <div class="access-error">
        <i class="bi bi-exclamation-circle-fill"></i>
        <span>{message}</span>
    </div>
    """
