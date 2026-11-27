# Galdus.ai — Claude Project Handoff

> **Purpose:** This document transfers the current project context, implementation status, architecture decisions, open work, and release checklist to Claude. Use it as the source of truth when continuing development.
>
> **Repository:** https://github.com/coobox-89/galdus.ai  
> **Default branch:** `main`  
> **Product tagline:** “The Open AI Operating System.”  
> **License:** AGPL-3.0-only  
> **Status:** 0.9.0 public early-access preview (GitHub Pages + Render free + Supabase free). Not yet hardened for a broad launch; see `docs/security/overview.md`.

## 1. Instructions for the receiving agent

Continue work in the existing repository. Do not recreate the project, replace the architecture without justification, or claim that builds, tests, deployments, or external services succeeded unless you actually ran or inspected them.

Work autonomously on code, tests, documentation, and configuration. Ask the owner only for actions that require their account, credentials, purchasing decision, or explicit authorization. Never ask them to paste secrets into chat or commit secrets to Git.

Before changing code:
1. Inspect the current `main` branch and latest commit; this handoff may become stale.
2. Read this file, `README.md`, `docs/product/roadmap.md`, and `docs/security/overview.md`.
3. Inspect the implementation and CI rather than assuming this document proves behavior.
4. Make small, reviewable commits and run tests/builds where possible.
5. Report exact commit SHAs and CI run URLs; distinguish verified facts from pending work.

## 2. Product vision and scope

Galdus.ai is an open-source, self-hostable AI platform for individuals, teams, and organizations. The intended modules are:

- **Models:** hosted and self-hosted model connections, routing, quotas, budgets, usage.
- **Agents:** task-oriented agents, tools, run history, scoped memory, approvals.
- **Knowledge:** source ingestion, indexing, retrieval, permissions, citations.
- **Automation:** schedules, triggers, retries, human approvals/tasks.
- **Governance:** RBAC, auditability, policies, operational visibility.
- **MCP:** managed MCP server connections and scoped credentials.

Target users: individuals and organizations. Distribution goal: web application plus desktop applications for Windows, macOS, and Linux. Hosting goal: managed Galdus cloud plus self-hosted deployment.

Do not present roadmap modules as implemented until they exist and have tests.

## 3. Confirmed architecture decisions

The owner has accepted the following direction:

| Layer | Selected technology | Responsibility |
|---|---|---|
| Web frontend | Netlify | Host React/Vite static web app and preview/production deploys |
| API | FastAPI container on a dedicated host (Render proposed) | Identity, application logic, LiteLLM chat gateway and future modules |
| Database | Supabase PostgreSQL | Persistent relational data; PostgreSQL accessed from API server |
| AI model gateway | LiteLLM (already in API) | Provider-neutral model calls |
| Desktop | Tauri 2 | Windows/macOS/Linux shell |
| Source control/CI | GitHub | Repository, pull requests, CI and desktop build workflows |

**Important architecture boundaries:**
- Supabase is currently selected as the managed PostgreSQL provider, not as a replacement for the existing FastAPI backend.
- Keep database credentials and AI provider keys server-side, in the API host's secret manager.
- The browser talks to FastAPI. It must not connect directly to PostgreSQL or receive service-role/database secrets.
- Do not migrate identity to Supabase Auth as part of the initial deployment without a separate design and migration plan. Current identity is implemented in FastAPI with Argon2 and JWT.
- Use Supabase's documented connection options/pooler and TLS settings appropriate for the selected compute/network mode. Verify the exact connection string in the Supabase project dashboard; do not guess hostnames, ports, or parameters.
- Netlify hosts the frontend only; it does not automatically run this FastAPI Docker service.

The owner previously indicated the desired domain is `galdus.ai`, but ownership/purchase has **not** been confirmed. Do not assume it is registered.

## 4. Current repository contents

- `apps/web`: React + Vite frontend; login/register/chat UI; Tauri 2 desktop shell under `src-tauri`.
- `apps/api`: FastAPI backend, LiteLLM integration, SQLAlchemy async, Alembic migrations.
- `apps/api/app/identity.py`: register, login, current-user dependency, profile and organization listing.
- `apps/api/app/models.py`: User, Organization and Membership SQLAlchemy models.
- `apps/api/app/auth.py`: password/JWT helpers.
- `apps/api/app/schemas.py`: chat request/response validation.
- `apps/api/migrations`: Alembic environment and initial identity migration.
- `docker-compose.yml`: local development stack including PostgreSQL, API and web.
- `netlify.toml`: Netlify build base `apps/web`, command `npm run build`, publish `dist`, SPA fallback.
- `.github/workflows/ci.yml`: Python syntax, pytest, npm install and Vite production build.
- `.github/workflows/desktop-build.yml`: multi-platform Tauri build workflow.
- `docs/DEPLOYMENT.md`: initial deployment guide (review/update it for Supabase before following it).
- `docs/product/roadmap.md`, `docs/security/overview.md`, `docs/architecture/0001-modular-monolith.md`.
- `LICENSE`: AGPL-3.0-only.

## 5. Existing functionality — verify before relying on it

The repository has a foundation implementation of:
- User registration with email, password, full name and organization name.
- Password hashing using Argon2.
- Login and short-lived JWT access tokens.
- `GET /api/v1/auth/me` and `GET /api/v1/auth/organizations`.
- Organization and membership records; initial registration creates an owner membership.
- Protected `POST /api/v1/chat/completions` endpoint using LiteLLM.
- Chat input validation limits (message count and content size).
- `GET /health` liveness endpoint and `GET /readyz` database readiness endpoint.
- Frontend login/register/chat and session restoration in sessionStorage.
- Netlify frontend build configuration.

Known implementation caveats:
- Chat model/provider configuration must be checked end-to-end. The UI/API model selection, LiteLLM settings and server-side provider credentials need a real smoke test.
- The JWT implementation currently has no refresh-token/session revocation system.
- Registration currently does not implement email verification or password reset.
- CORS configuration and production API URL must be set for the final Netlify origin.
- Tenant scoping is currently demonstrated by organization listing. Every future tenant-owned query and mutation must enforce membership and organization scope server-side.
- A successful frontend build does not prove that the API, database, auth or AI provider work in production.
- The existing docs are early-stage and may be stale relative to later commits.

## 6. Repository history and CI context

The project was incrementally scaffolded and pushed to `main`. Important earlier commits include:
- `36ca864` initial scaffold
- `920e112` PostgreSQL and identity API
- `f75ca7a` web deployment and Tauri desktop
- `fad9242` protect chat endpoint
- `e745c9f` restore persisted UI auth session
- `5f8948e` initial CI
- `e0e7b09`, `9cd9877`, `e6849f4` tests and CI integration
- `3a1a483` reject whitespace-only registration names
- `dcbd4ab` bound chat request payload size
- `cb3d264` extra identity validation/session tests
- `ff2e148` organization scoping test (the CI run failed due to a UUID representation assertion)
- `dcbe484` fix UUID assertion in that test

Subsequent commits added Netlify configuration, readiness checks, tests and deployment documentation. **Always query GitHub for the current HEAD and latest Actions status; the list above is not guaranteed to be exhaustive or current.**

Previous CI history included a failure caused by configuring npm cache against a missing lockfile; the cache setting was removed. Another test failure was due to comparing UUID string formats; the test was adjusted. Do not assume a past success means current HEAD is green.

## 7. Immediate technical work — recommended order

### P0 — Establish a trustworthy baseline
- Fetch latest `main`, inspect current files and latest GitHub Actions runs.
- Run API tests and frontend build; fix failures.
- Check the desktop workflow and platform prerequisites.
- Confirm Alembic migration is reproducible from an empty PostgreSQL database.
- Add a CI PostgreSQL service/container and migration integration tests if feasible.
- Add a lockfile (npm package-lock) and use `npm ci` in CI for reproducible builds.

### P0 — Make the Supabase database integration production-safe
- Keep SQLAlchemy async + asyncpg unless a tested reason requires change.
- Verify Supabase connection mode for the selected deployment host. Prefer the appropriate Supabase pooler for server/container workloads when direct IPv6/network restrictions apply; confirm the provider's current documentation and project settings.
- Ensure TLS is enabled as required by the actual connection string.
- Review SQLAlchemy pool size, overflow, timeout and recycle settings for serverless/container concurrency.
- Use a dedicated least-privilege database role for the application; do not use a Supabase service-role key as a database password.
- Ensure Alembic migrations run once as a release step, not concurrently on every API worker startup.
- Test migrations against a clean Supabase-compatible PostgreSQL instance and validate backup/restore procedures.
- Never commit a real `DATABASE_URL`.

### P0 — Harden identity and tenant boundaries
- Add HTTP-level tests for missing, malformed, expired and invalid JWTs.
- Add tests for duplicate registration and login failure behavior.
- Add a session strategy: refresh tokens or revocable sessions, secure rotation and logout semantics. Decide cookie vs bearer-token storage based on threat model; do not casually store long-lived tokens in localStorage.
- Add email verification and password reset with a transactional email provider; require owner approval for provider account/credentials.
- Add rate limiting for login/register/chat, brute-force protections, request size/timeouts and safe error responses.
- Add explicit organization membership/role checks to every tenant-owned endpoint.
- Add audit events for security-sensitive actions.
- Review CORS, security headers, API docs exposure, logging redaction and secret handling.
- Add account deletion/data export policy and privacy/retention documentation before public signups.

### P0 — Make chat genuinely usable
- Verify model selection is constrained to server-configured/allowed providers; do not allow arbitrary user-supplied model names to access unintended providers.
- Ensure provider keys are only in backend environment variables.
- Add provider timeout, retries with limits, safe error handling, token/usage tracking and per-user/organization quotas.
- Test a real end-to-end chat request using an approved provider credential.
- Add rate limits and cost controls before inviting external users.

### P1 — Improve the frontend and product experience
- Add loading/error/empty states, validation and accessible forms.
- Add workspace/organization selection and a clear current-workspace context.
- Add user profile and logout/session-expired UX.
- Add model/provider settings appropriate to the MVP without exposing secrets.
- Add privacy, terms, acceptable-use and support/contact pages before public launch.
- Ensure responsive mobile UI and test keyboard/accessibility.

### P1 — Deploy public MVP
1. Create Supabase project in an EU region where available and suitable (verify current region options in dashboard).
2. Configure PostgreSQL database role, password, connection string and pooler/TLS settings.
3. Deploy FastAPI container from `apps/api/Dockerfile` on Render or another approved Docker host.
4. Set API secrets/config in that host: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `OPENAI_API_KEY` (or approved model provider variables), `LITELLM_MODEL`.
5. Run Alembic migrations once using the production environment.
6. Verify `GET /health`, `GET /readyz`, auth endpoints and a real chat completion.
7. Import GitHub repository into Netlify. Build settings are in `netlify.toml`.
8. Set Netlify build variable `VITE_API_BASE_URL=https://<api-host>/api`; this value is public, never a secret.
9. Set exact Netlify site origin in API `CORS_ORIGINS`; redeploy/restart API.
10. Test registration, login, reload/session restoration, organization listing, chat, second-account isolation, mobile layout and logs.
11. Configure custom domain only after owner confirms domain ownership and DNS access.
12. Configure monitoring, alerts, backups and perform restore test before public announcement.

### P1 — Desktop releases
- Set remote API URL at build time using `VITE_API_BASE_URL`.
- Verify Tauri builds on Windows, macOS and Linux.
- Configure signing/notarization for production installers (requires owner-controlled certificates/accounts and may incur costs).
- Test desktop app against staging API before release.

### P2 — Complete product modules
Implement in this order after the secure MVP:
1. Models registry and provider routing, encrypted provider credentials, usage/budgets.
2. Agents with scoped tools, run history, approvals and sandboxed execution.
3. Knowledge ingestion, chunking, embeddings, pgvector retrieval, per-tenant access control and citations.
4. Automation scheduler, triggers, retries, idempotency and human approval.
5. MCP integrations with scoped credentials and allowlists.
6. Governance policies, audit, RBAC, retention and admin console.
7. Self-hosted installation profile and enterprise operations.

## 8. Required environment variables (names are not secrets)

Current settings include:
- `DATABASE_URL`: SQLAlchemy async PostgreSQL connection URL. Use actual Supabase connection details and TLS options from the dashboard.
- `JWT_SECRET`: long cryptographically random secret; generate in a secret manager, never commit it.
- `CORS_ORIGINS`: exact allowed frontend origin(s), comma-separated if supported by config.
- `OPENAI_API_KEY`: provider key, only if using OpenAI; keep on API host.
- `LITELLM_MODEL`: model identifier supported by installed LiteLLM.
- `VITE_API_BASE_URL`: public frontend build variable ending in `/api`; not a secret.

Inspect `apps/api/app/config.py` before deployment. Add settings only with validation, safe defaults and tests. Do not expose `JWT_SECRET`, database credentials or AI provider keys in `VITE_*` variables.

## 9. Owner actions that will eventually be required

Do not request all of these at once. Ask only when the project reaches that step:
- Authorize Netlify to access the GitHub repository and create the site.
- Create/authorize a Supabase project and choose a billing plan if the free tier is insufficient for the required production reliability/limits.
- Approve Render (or alternative) account/service and any paid plan required for an always-on API.
- Create an AI provider API key and enter it directly in the backend host's secret settings.
- Confirm whether `galdus.ai` is already owned; if not, approve domain purchase and DNS configuration.
- Provide email delivery provider credentials for verification/reset flows, entered directly into secret settings.
- Provide desktop signing/notarization credentials only when ready for signed releases.
- Approve any paid services, purchases, production data migrations or irreversible actions.

Never ask the owner to share passwords, API keys, private keys, recovery codes or database URLs in this chat or in a GitHub issue. Guide them to enter secrets directly into the provider's secure dashboard.

## 10. Definition of “public MVP usable”

Do not declare launch-ready until all applicable checks pass:
- [ ] Latest main CI is green.
- [ ] Reproducible frontend build and API tests.
- [ ] Database migration from empty database passes.
- [ ] Supabase PostgreSQL connectivity and TLS verified from deployed API host.
- [ ] Health and readiness checks pass in production.
- [ ] Registration, login, logout/session expiry and profile work.
- [ ] Tenant boundaries tested with at least two separate users/organizations.
- [ ] Real AI provider response works; errors, timeouts and cost limits are controlled.
- [ ] API rate limiting and brute-force controls are active.
- [ ] No secrets in frontend bundle, Git history, logs or repository.
- [ ] CORS, HTTPS, security headers and production docs policy reviewed.
- [ ] Backup schedule configured and restore procedure tested.
- [ ] Monitoring, error reporting and incident contact are configured.
- [ ] Privacy policy, terms, acceptable-use and support contact published.
- [ ] Mobile browser smoke test passes.
- [ ] Owner approves public launch.

## 11. How Claude should report progress

For each work session, provide:
1. Current branch and HEAD SHA.
2. Files changed and purpose.
3. Tests/builds actually run and exact outcomes.
4. CI run URL and conclusion, if available.
5. External services configured vs merely documented.
6. Exact owner actions needed next, with links and no secret sharing.
7. Remaining risks/blockers.

**Do not claim Galdus.ai is deployed, production-ready, or feature-complete until the definition of done above is satisfied.**

## 12. Status update — 2026-11-27 (v0.3.0 hardening)

Verified locally (Python 3.13, PostgreSQL 16, Node 22): 43 API tests passing including HTTP integration tests against a real migrated database; Alembic upgrade → downgrade → upgrade → `alembic check` clean; `npm ci && npm run build` succeeds; bundle contains no server secrets.

Added: model allowlist, usage tracking and daily token budget (`usage_events`, migration 0002), Supabase Data API lockdown (RLS + revokes, migration 0003), rate limiting, organization membership dependency, production config validation, security headers, pooler-aware DB engine, multi-turn chat UI with workspace/model selection, `render.yaml`, npm lockfile + `npm ci`, CI with PostgreSQL service and Docker build, desktop icons.

Not yet done / not verified: no Supabase project, Render service or Netlify site exists for Galdus; no real provider call has been made; Docker image and desktop builds are verified only by CI once pushed.

## 13. Status update — 2026-11-27 (v0.4: platform modules and brand redesign)

Branches stacked for review: `feat/models-byok` (#3) → `feat/knowledge-agents-apps` (#4) → `feat/platform-phase3` → `feat/brand-ux-redesign`.

Modules now implemented and tested (83 API tests on PostgreSQL + pgvector): Models (BYOK, 12 providers, encrypted keys), Knowledge (upload/URL import, semantic or keyword search, citations), Agents (instructions, knowledge, built-in tools, MCP tools, run history with steps), Apps (8 templates), Automation (cron, incoming webhooks, outgoing delivery, scheduler via GitHub Actions), Governance (roles, invitations, audit log, workspace token limit, guardrails), Platform admin.

Frontend redesigned on the Galdus brand identity (Montserrat, Blue Night #0B1F3B, Lime #B6FF00, Energy Yellow #FFC107, Cloud White #F8FAFC). Motion: logo assembly on the landing, shared-layout lime "pixel" as the active-navigation indicator, page transitions, pixel loader, toasts, command palette (Ctrl+K). Respects prefers-reduced-motion.

Not yet built: SSO (OIDC/SAML), Drive/SharePoint/S3 sync connectors, code sandbox, streaming responses, email delivery (invitations are shared as links), refresh tokens.
