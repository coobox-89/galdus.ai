"""OAuth 2.0 for sign-in (Google, GitHub) and for cloud-drive connectors (Google Drive,
Microsoft 365). State is encrypted (it carries the PKCE verifier) and expires in 10 minutes.
"""
import base64
import hashlib
import json
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from .config import settings
from .crypto import SecretUnavailable, decrypt, encrypt

STATE_TTL = 600

PROVIDERS = {
    "google": {
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "login_scope": "openid email profile",
        "pkce": True,
    },
    "github": {
        "authorize": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "login_scope": "read:user user:email",
        "pkce": False,
    },
    "microsoft": {
        "authorize": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
        "token": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        "login_scope": "openid email profile",
        "pkce": True,
    },
}


def client(provider: str) -> tuple[str, str]:
    cid = getattr(settings, f"{provider}_client_id", "")
    secret = getattr(settings, f"{provider}_client_secret", "")
    return cid, secret


def configured(provider: str) -> bool:
    cid, secret = client(provider)
    return bool(cid and secret)


def _url(provider: str, key: str) -> str:
    return PROVIDERS[provider][key].format(tenant=settings.microsoft_tenant or "common")


def redirect_uri(provider: str, purpose: str) -> str:
    base = settings.public_api_url.rstrip("/")
    return f"{base}/api/v1/auth/oauth/{provider}/callback" if purpose == "login" else f"{base}/api/v1/connectors/{provider}/callback"


def make_state(payload: dict) -> str:
    try:
        return encrypt(json.dumps({**payload, "exp": int(time.time()) + STATE_TTL}))
    except SecretUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def read_state(state: str) -> dict:
    try:
        data = json.loads(decrypt(state))
    except (SecretUnavailable, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid sign-in state. Please try again.") from exc
    if data.get("exp", 0) < time.time():
        raise HTTPException(status_code=400, detail="The sign-in link expired. Please try again.")
    return data


def authorize_url(provider: str, purpose: str, scope: str, extra_state: dict | None = None, extra_params: dict | None = None) -> str:
    if provider not in PROVIDERS or not configured(provider):
        raise HTTPException(status_code=404, detail="This provider is not configured on this server")
    cid, _ = client(provider)
    state = {"p": provider, "purpose": purpose, **(extra_state or {})}
    params = {"client_id": cid, "redirect_uri": redirect_uri(provider, purpose), "response_type": "code", "scope": scope}
    if PROVIDERS[provider]["pkce"]:
        verifier = secrets.token_urlsafe(48)
        state["v"] = verifier
        params["code_challenge"] = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        params["code_challenge_method"] = "S256"
    params["state"] = make_state(state)
    params.update(extra_params or {})
    return f"{_url(provider, 'authorize')}?{urlencode(params)}"


async def exchange_code(provider: str, purpose: str, code: str, state: dict) -> dict:
    cid, secret = client(provider)
    data = {"client_id": cid, "client_secret": secret, "code": code, "grant_type": "authorization_code",
            "redirect_uri": redirect_uri(provider, purpose)}
    if state.get("v"):
        data["code_verifier"] = state["v"]
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.post(_url(provider, "token"), data=data, headers={"Accept": "application/json"})
    body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    if resp.status_code >= 400 or "access_token" not in body:
        raise HTTPException(status_code=400, detail="The provider did not accept the sign-in. Please try again.")
    return body


async def refresh(provider: str, refresh_token: str, scope: str | None = None) -> dict:
    cid, secret = client(provider)
    data = {"client_id": cid, "client_secret": secret, "refresh_token": refresh_token, "grant_type": "refresh_token"}
    if scope:
        data["scope"] = scope
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.post(_url(provider, "token"), data=data, headers={"Accept": "application/json"})
    if resp.status_code >= 400:
        raise HTTPException(status_code=401, detail="The cloud connection expired. Reconnect it in Integrations.")
    return resp.json()


async def fetch_identity(provider: str, access_token: str) -> dict:
    """Return {subject, email, name, verified} for a login provider."""
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=20) as http:
        if provider == "google":
            r = (await http.get("https://openidconnect.googleapis.com/v1/userinfo", headers=headers)).json()
            return {"subject": str(r.get("sub")), "email": (r.get("email") or "").lower(), "name": r.get("name") or "",
                    "verified": bool(r.get("email_verified"))}
        if provider == "github":
            u = (await http.get("https://api.github.com/user", headers=headers)).json()
            emails = (await http.get("https://api.github.com/user/emails", headers=headers)).json()
            primary = next((e for e in emails if isinstance(e, dict) and e.get("primary") and e.get("verified")), None)
            return {"subject": str(u.get("id")), "email": (primary or {}).get("email", "").lower(),
                    "name": u.get("name") or u.get("login") or "", "verified": bool(primary)}
        if provider == "microsoft":
            r = (await http.get("https://graph.microsoft.com/v1.0/me", headers=headers)).json()
            return {"subject": str(r.get("id")), "email": (r.get("mail") or r.get("userPrincipalName") or "").lower(),
                    "name": r.get("displayName") or "", "verified": False}  # not used to link accounts by email
    raise HTTPException(status_code=404, detail="Unknown provider")
