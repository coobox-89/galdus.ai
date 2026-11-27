# Security overview

Galdus.ai is an early MVP. The controls below exist and are covered by tests; the gaps listed must be closed before a broad public launch.

## Implemented controls

- **Identity:** Argon2 password hashing, 30-minute HS256 JWTs, constant-time-ish login (dummy hash for unknown accounts), identical errors for wrong password and unknown email, duplicate-registration race handled.
- **Tenant boundary:** `current_membership` resolves the acting organization (`X-Organization-Id`) and returns 403 for non-members. Every tenant-owned endpoint must depend on it.
- **Abuse limits:** per-IP limits on login/register, per-user limits on chat, daily per-user token budget stored in `usage_events`, request-size limit, bounded conversation size, provider timeout and retry cap, output-token cap.
- **Model access:** only server-allowlisted model identifiers (`ALLOWED_MODELS`) reach LiteLLM; provider keys stay server-side; provider errors are logged by type only and never returned to clients.
- **Transport/headers:** strict CORS allowlist, `nosniff`, `DENY` framing, `no-referrer`, `no-store` on API responses, HSTS in production; Netlify adds equivalent headers for the frontend.
- **Configuration:** `ENVIRONMENT=production` refuses unsafe settings and disables `/docs`.
- **Database:** RLS enabled and `anon`/`authenticated` privileges revoked on all tables (Supabase Data API cannot read them); app uses a dedicated non-superuser role.
- **Container:** API runs as an unprivileged user; uvicorn trusts forwarded headers only from `FORWARDED_ALLOW_IPS`.

## Open gaps

- Refresh tokens / session revocation; email verification; password reset.
- Shared (multi-instance) rate limiting.
- Audit events for security-sensitive actions.
- Dependency and image scanning in CI; vulnerability disclosure process.
- Account deletion and data-export flows; privacy, retention and terms documentation.

Never commit API keys, access tokens, private keys, production data, or `.env` files. Treat model output and retrieved documents as untrusted input. Require explicit authorization and human approval for consequential external actions.
