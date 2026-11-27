<p align="center"><img src="../assets/header-security.jpg" alt="Galdus.ai security overview" width="100%"></p>

# Security overview

Galdus.ai is in early access. The controls below exist and are covered by tests. The gaps must be closed before a broad public launch. To report a vulnerability, follow [SECURITY.md](../../SECURITY.md).

## Implemented controls

| Area | Control |
|:--|:--|
| Identity | Argon2 password hashing; 30-minute HS256 JWTs; dummy-hash login timing for unknown accounts; identical errors for wrong password and unknown email; OAuth with encrypted state (and PKCE where the provider supports it); provider accounts linked only on a verified email; single-use, short-lived password reset tokens |
| Tenant boundary | `current_membership` resolves the acting workspace from `X-Organization-Id` and returns 403 to non-members; every workspace resource is filtered by organization; owner, admin and member roles |
| Secrets | Provider keys and drive tokens encrypted with Fernet (`ENCRYPTION_KEY`); keys never returned to the browser; provider errors logged by type only |
| Abuse limits | Per-IP limits on sign-in and registration, per-user chat limits, daily per-user and monthly per-workspace token budgets, request size and conversation length limits, provider timeout and retry caps |
| Model safety | Retrieved documents, attachments and tool results fenced as untrusted content; likely prompt injections neutralised; MCP tools limited to an allowlist per server; private-network model endpoints blocked unless enabled for self-hosting |
| Audit | Audit log for members, invitations, model connections, knowledge, agents, automations, MCP servers, cloud drives and workspace settings |
| Transport | Strict CORS allowlist, `nosniff`, `DENY` framing, `no-referrer`, `no-store` on API responses, HSTS in production |
| Configuration | `ENVIRONMENT=production` refuses unsafe settings and hides `/docs` |
| Database | Row-level security enabled and `anon` and `authenticated` privileges revoked on every table, so the Supabase Data API cannot read them; the API uses a dedicated non-superuser role |
| Container | API runs as an unprivileged user; forwarded headers trusted only from `FORWARDED_ALLOW_IPS` |

## Open gaps

- Refresh tokens and session revocation.
- Email verification for password accounts.
- Shared rate limiting across several API instances.
- Dependency and image scanning in CI; published SBOM.
- Final privacy, retention and terms documents approved by the owner.

## Rules for contributors and operators

Never commit API keys, access tokens, private keys, production data or `.env` files. Treat model output and retrieved documents as untrusted input. Require explicit authorization and human approval before consequential external actions.
