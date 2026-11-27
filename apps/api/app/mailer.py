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


def _esc(v: str) -> str:
    from html import escape
    return escape(v, quote=True)


def _html(title: str, body: str, button: str, url: str, note: str = "", code: str = "") -> str:
    """Branded, table-based layout that renders in Gmail, Outlook and Apple Mail (dark Blue Night card, lime button)."""
    base = settings.frontend_url.rstrip("/")
    logo = f"{base}/email/logo.png"
    t, b, bt, u, n = _esc(title), _esc(body), _esc(button), _esc(url), _esc(note)
    code_block = (f'<tr><td style="padding:4px 40px 8px"><div style="font-family:Consolas,Menlo,monospace;font-size:28px;letter-spacing:8px;'
                  f'font-weight:700;color:#B6FF00;background:#071530;border:1px solid #1E3A63;border-radius:12px;padding:14px 18px;text-align:center">{_esc(code)}</div></td></tr>') if code else ""
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><title>{t}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#071530">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{b}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#071530;background-image:radial-gradient(60% 50% at 80% 0%,rgba(182,255,0,.12),transparent 60%)">
<tr><td align="center" style="padding:36px 16px">
 <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;font-family:Montserrat,'Segoe UI',Arial,sans-serif">
  <tr><td style="padding:0 8px 18px"><a href="{base}" style="text-decoration:none;color:#F8FAFC;font-size:20px;font-weight:800">
   <img src="{logo}" width="34" height="34" alt="" style="vertical-align:middle;border:0;margin-right:10px">Galdus<span style="color:#B6FF00">.ai</span></a></td></tr>
  <tr><td style="background:#0E2547;background-image:linear-gradient(160deg,#14335F,#0B1F3B);border:1px solid #1E3A63;border-radius:20px;overflow:hidden">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="height:4px;background:#B6FF00;background-image:linear-gradient(90deg,#E4FF6B,#B6FF00,#3FD47A);font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:36px 40px 8px"><h1 style="margin:0;font-size:26px;line-height:1.2;font-weight:800;color:#F8FAFC;letter-spacing:-.02em">{t}</h1></td></tr>
    <tr><td style="padding:8px 40px 20px;font-size:15px;line-height:1.65;color:#C9D6E8">{b}</td></tr>
    {code_block}
    <tr><td style="padding:8px 40px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
     <td style="border-radius:12px;background:#B6FF00;background-image:linear-gradient(90deg,#E4FF6B,#B6FF00 50%,#3FD47A)">
      <a href="{u}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:800;color:#0B1F3B;text-decoration:none;border-radius:12px">{bt} &rarr;</a></td></tr></table></td></tr>
    <tr><td style="padding:18px 40px 8px;font-size:12px;line-height:1.6;color:#8EA2BC">If the button does not work, copy this address into your browser:<br>
     <a href="{u}" style="color:#B6FF00;word-break:break-all">{u}</a></td></tr>
    <tr><td style="padding:14px 40px 34px;font-size:12px;line-height:1.6;color:#8EA2BC">{n or "If you did not expect this email you can ignore it."}</td></tr>
   </table></td></tr>
  <tr><td style="padding:22px 8px 0;font-size:12px;line-height:1.6;color:#6F86A8;text-align:center">
   <b style="color:#C9D6E8">Galdus.ai</b> &middot; Powered by you. <span style="color:#B6FF00">Supercharged by AI.</span><br>
   <a href="{base}/privacy" style="color:#8EA2BC">Privacy</a> &nbsp;&middot;&nbsp; <a href="{base}/terms" style="color:#8EA2BC">Terms</a></td></tr>
 </table></td></tr></table></body></html>"""


async def send(to: str, subject: str, title: str, body: str, button: str, url: str, note: str = "") -> bool:
    """Best effort: returns False instead of raising, so flows keep working without email."""
    if not email_enabled():
        return False
    try:
        text = f"{title}\n\n{body}\n\n{button}: {url}\n\n{note}".strip()
        await asyncio.to_thread(_send, to, subject, text, _html(title, body, button, url, note))
        return True
    except Exception as exc:
        logger.warning("Email to %s failed: %s", to.split("@")[-1], type(exc).__name__)
        return False
