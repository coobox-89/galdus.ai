# Galdus.ai: project handoff

> Context for a developer or new maintainer continuing the work. Verify against the code: this page summarizes, the code and tests decide.

- **Repository:** https://github.com/coobox-89/galdus.ai, default branch `main`, license AGPL-3.0-only.
- **Version:** 1.0.0-rc.1 (`apps/api/app/version.py`, `apps/web/package.json`, `apps/api/pyproject.toml`; a test keeps them equal).
- **Status:** release candidate. Verdict and open owner tasks: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## Rules

1. Inspect `main` and the latest CI run before changing anything; never claim a build, test or deploy succeeded without running or reading it.
2. Ask the owner only for what needs their accounts, credentials or decisions. Never ask for secrets in chat; they go into the Render, Supabase or GitHub dashboards.
3. Small reviewable commits on a branch, one pull request, CI green (tests, migrations, audits, gitleaks, builds, E2E).
4. Provider logos in `apps/web/public/brand/providers` are third-party trademarks: do not edit or redraw them. Together AI has no mark yet (monogram).
5. Brand: Montserrat, Blue Night `#0B1F3B`, Lime `#B6FF00` (`--lime`), Energy Yellow `#FFC107`, Cloud White `#F8FAFC`. US English in the interface, no spaced em dash in user-facing text.

## Where things are

| Topic | Read |
|:--|:--|
| Components and flows | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Hosting and every variable | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Deploy, rollback, rotation, backups, incidents | [OPERATIONS.md](OPERATIONS.md) |
| Endpoints | [API.md](API.md), [api/openapi.json](api/openapi.json) |
| Security controls and the latest review | [security/overview.md](security/overview.md), [security/review-2026-11-27.md](security/review-2026-11-27.md) |
| What users see | [USER_GUIDE.md](USER_GUIDE.md) |

## Hosting today

GitHub Pages (console, `.github/workflows/pages.yml`), Render free (API, `render.yaml`, migrations at container start), Supabase free (PostgreSQL 16 + pgvector, role `galdus_app`, RLS on every table). Scheduler and uptime checks run as GitHub Actions. Netlify is no longer used.

## Conventions worth knowing

- Every workspace endpoint depends on `current_membership` and filters by `organization_id`; owners and admins write, members use.
- New tables: enable row-level security in the migration (a test fails otherwise). Migrations must stay compatible with the previous release for a few minutes.
- Secrets go through `crypto.encrypt`. Logs never contain bodies, prompts, tokens or query strings (`app/logs.py`).
- Regenerate `docs/api/openapi.json` when endpoints change (`python -m app.openapi_export`), and `apps/api/requirements.lock` when dependencies change.
- Tests: `apps/api/tests` (pytest, database tests need `TEST_DATABASE_URL`), `apps/web/e2e` (Playwright with `fake-llm.mjs`).

## Next work

See the roadmap ([product/roadmap.md](product/roadmap.md)) and the residual risks in the security review: passkeys, required two-step policy per workspace, DNS-pinned outbound client, SBOM and image scanning, httpOnly cookie sessions once console and API share a site.
