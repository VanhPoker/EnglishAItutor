"""Small SMTP mailer used for password reset codes."""

from __future__ import annotations

import smtplib
from email.message import EmailMessage

from loguru import logger

from app.core.settings import settings


def send_email(to_email: str, subject: str, body: str) -> bool:
    username = settings.SMTP_USERNAME
    password = settings.SMTP_PASSWORD.get_secret_value() if settings.SMTP_PASSWORD else None
    from_email = settings.SMTP_FROM_EMAIL or username

    if not username or not password or not from_email:
        logger.warning("SMTP is not configured; password reset email for {} was not sent.", to_email)
        return False

    message = EmailMessage()
    message["From"] = from_email
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(username, password)
        smtp.send_message(message)
    return True
