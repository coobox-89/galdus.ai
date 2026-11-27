"""Outgoing transactional email over SMTP (works with Resend, Brevo, SES, Mailgun...)."""
import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import settings

logger = logging.getLogger("galdus.mail")


def email_enabled() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def _send(to: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    context = ssl.create_default_context()
    if settings.smtp_port == 465:
        with smtplib.SMTP_SSL(settings.smtp_host, 465, context=context, timeout=20) as s:
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as s:
            s.starttls(context=context)
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)


def _html(title: str, body: str, button: str, url: str) -> str:
    return f"""<div style="font-family:Montserrat,Arial,sans-serif;background:#0B1F3B;padding:32px;color:#F8FAFC">
<div style="max-width:520px;margin:auto;background:#11284A;border-radius:16px;padding:32px;border:1px solid #1E3A63">
<div style="font-weight:800;font-size:20px;margin-bottom:20px">Galdus<span style="color:#B6FF00">.ai</span></div>
<h1 style="font-size:22px;margin:0 0 12px">{title}</h1><p style="color:#9DB0CB;line-height:1.6">{body}</p>
<a href="{url}" style="display:inline-block;margin-top:12px;background:#B6FF00;color:#0B1F3B;padding:12px 20px;border-radius:10px;font-weight:700;text-decoration:none">{button}</a>
<p style="color:#6F86A8;font-size:12px;margin-top:24px">If you did not expect this email you can ignore it.</p></div></div>"""


async def send(to: str, subject: str, title: str, body: str, button: str, url: str) -> bool:
    """Best effort: returns False instead of raising, so flows keep working without email."""
    if not email_enabled():
        return False
    try:
        await asyncio.to_thread(_send, to, subject, f"{title}\n\n{body}\n\n{button}: {url}", _html(title, body, button, url))
        return True
    except Exception as exc:
        logger.warning("Email to %s failed: %s", to.split("@")[-1], type(exc).__name__)
        return False
