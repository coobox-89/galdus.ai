<p align="center"><img src="../assets/header-security.jpg" alt="Galdus.ai security overview" width="100%"></p>

# Security overview

Galdus.ai is in early access. The controls below exist and are covered by tests. The gaps must be closed before a broad public launch. To report a vulnerability, follow [SECURITY.md](../../SECURITY.md).

## Implemented controls

| Area | Control |
|:--|:--|
| Identity | Optional two-step verification (TOTP with replay protection, hashed single-use recovery codes, secret encrypted at rest, required for password and OAuth sign-in once on); email verification with single-use, 48-hour links; Argon2 password hashing; 30-minute HS256 JWTs revoked on password change, password reset and "sign out everywhere"; dummy-hash login timing for unknown accounts; identical errors for wrong password and unknown email; OAuth with encrypted state bound to the browser that started sign-in (login-CSRF protection) and PKCE where the provider supports it; provider accounts linked only on a verified email; single-use, short-lived password reset tokens |
| Tenant boundary | `current_membership` resolves the acting workspace from `X-Organization-Id` and returns 403 to non-members; every workspace resource is filtered by organization; owner, admin and member roles; only owners and admins change knowledge, browse or import from connected drives, and manage models, agents, automations and MCP servers |
| Secrets | Provider keys and drive tokens encrypted with Fernet (`ENCRYPTION_KEY`); keys never returned to the browser; provider errors logged by type only |
| Abuse limits | In-process or shared (Postgres) per-IP limits on sign-in and registration, per-user chat limits, daily per-user and monthly per-workspace token budgets, request size and conversation length limits, provider timeout and retry caps |
| Uploads | Size limits per endpoint, chat images checked by file signature, bodies without Content-Length refused |
| Model safety | Retrieved documents, attachments and tool results fenced as untrusted content; likely prompt injections neutralised; MCP tools limited to an allowlist per server; private-network model endpoints blocked unless enabled for self-hosting |
| Retention | Usage and audit records deleted after 24 months, expired one-time links after 7 days, by the scheduler |
| Audit | Audit log for members, invitations, model connections, knowledge, agents, automations, MCP servers, cloud drives and workspace settings |
| Transport | Strict CORS allowlist, `nosniff`, `DENY` framing, `no-referrer`, `no-store` on API responses, HSTS in production |
| Configuration | `ENVIRONMENT=production` refuses unsafe settings and hides `/docs` |
| Database | Row-level security enabled and `anon` and `authenticated` privileges revoked on every table, so the Supabase Data API cannot read them; the API uses a dedicated non-superuser role |
| Container | API runs as an unprivileged user; forwarded headers trusted only from `FORWARDED_ALLOW_IPS` |

## Open gaps

- Shared rate limits exist (`RATE_LIMIT_BACKEND=postgres`) but are off by default on the single free instance.
- Outbound requests are checked against private addresses before connecting; a DNS-rebinding-proof resolver is not in place yet.
- Container image scanning and a published SBOM (dependency audit already runs in CI).
- Final privacy, retention and terms documents approved by the owner.

## Rules for contributors and operators

Never commit API keys, access tokens, private keys, production data or `.env` files. Treat model output and retrieved documents as untrusted input. Require explicit authorization and human approval before consequential external actions.
