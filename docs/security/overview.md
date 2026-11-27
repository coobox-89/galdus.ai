<p align="center"><img src="../assets/header-security.jpg" alt="Galdus.ai security overview" width="100%"></p>

# Security overview

The controls below exist and are covered by automated tests. The latest review, with its findings, fixes and accepted residual risks, is [review-2026-11-27.md](review-2026-11-27.md). To report a vulnerability, follow [SECURITY.md](../../SECURITY.md).

## Implemented controls

| Area | Control |
|:--|:--|
| Identity | Argon2 password hashing; 30-minute HS256 JWTs revoked on password change, password reset and "sign out everywhere"; identical answers and dummy-hash timing for unknown accounts; per-account lockout after 5 failed passwords in 15 minutes; optional two-step verification (TOTP with replay protection, 10 hashed single-use recovery codes, secret encrypted at rest, at most 10 wrong codes per 15 minutes, required for every sign-in method once on); email verification with single-use 48-hour links; single-use one-hour reset links (using one revokes the others), at most three reset emails per address per hour; with `REQUIRE_EMAIL_VERIFICATION` registration does not reveal existing accounts |
| OAuth | Google, GitHub and Microsoft; encrypted, expiring state with PKCE; sign-in bound to the browser that started it (nonce cookie); fixed redirect URIs; accounts linked by email only when the provider verified it, never for Microsoft; drive connections completed by the signed-in session that started them |
| Platform admins | `ADMIN_EMAILS` applies only to a confirmed address in production; admins can be granted or revoked in the console |
| Tenant boundary | `current_membership` resolves the workspace from `X-Organization-Id` and returns 403 to non-members; every workspace query filters by organization; owner, admin and member roles; only owners and admins change models, knowledge, agents, automations, MCP servers and drives |
| Database | Row-level security on every table with `anon` and `authenticated` revoked (the Supabase Data API sees nothing), enforced by a test; dedicated non-superuser role; SQL parameters hidden from logs |
| Secrets | Provider keys, drive tokens, MCP headers, OAuth state, delivery URLs and TOTP secrets encrypted with Fernet (`ENCRYPTION_KEY`); never returned to the browser; provider error text redacted; secret scanning (gitleaks) on the whole history in CI |
| Abuse limits | Per-IP limits on sign-in, registration, reset and OAuth; per-user limits on chat, uploads, search, tests, exports; per-automation webhook limit; daily per-user and monthly per-workspace token budgets; memory or shared Postgres counters |
| Input and uploads | Pydantic limits on every body; request size limits per endpoint; PDF signature and image signature checks; binary files refused as text; Content-Length required |
| Outbound requests | Private, loopback, link-local and reserved addresses refused for web import, `web_fetch`, model endpoints, MCP servers and delivery webhooks, re-checked on every redirect; https required unless self-hosting is enabled |
| Model safety | Retrieved documents, attachments and tool results fenced as untrusted; known prompt-injection patterns neutralized; MCP tools allowlisted per server |
| Headers | API: strict CORS allowlist, CSP `default-src 'none'; frame-ancestors 'none'`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP, `no-store`, HSTS in production. Console: CSP allowing only its own scripts and the configured API; nginx adds the headers in Docker installs |
| Logs and privacy | JSON logs with route templates, status, duration and request id only (no bodies, prompts, tokens or query strings); retention by the scheduler (usage and audit 24 months, one-time links 7 days); data export (GDPR art. 15 and 20) and self-service deletion |
| Configuration | `ENVIRONMENT=production` refuses missing or development secrets, non-https public URLs, wildcard CORS and disabled rate limits; `/docs` hidden |
| Supply chain | Pinned versions (`requirements.lock`, `package-lock.json`); `pip-audit` and `npm audit` block high and critical issues in CI; licences checked for AGPL-3.0 compatibility |
| Container | API runs as an unprivileged user; health check; forwarded headers trusted only from `FORWARDED_ALLOW_IPS` (or `CLIENT_IP_HEADER`) |

## Known limits

The accepted residual risks (forwarded-address spoofing behind Render, registration conflicts without SMTP, tokens in `sessionStorage`, DNS rebinding, lockout abuse, headers on GitHub Pages, prompt injection, backups on the free plan) are described with their mitigations in the [review](review-2026-11-27.md#residual-risks-accepted).

Planned: passkeys (WebAuthn), a workspace policy requiring two-step verification, container image scanning and an SBOM, a DNS-pinning HTTP client for outbound requests.

## Rules for contributors and operators

Never commit API keys, access tokens, private keys, production data or `.env` files. Every new table needs row-level security in its migration. Treat model output and retrieved documents as untrusted input. Require explicit authorization and human approval before consequential external actions.
