<p align="center"><img src="docs/assets/header-contributing.jpg" alt="Contributing to Galdus.ai" width="100%"></p>

# Contributing

Thanks for helping build Galdus.ai. This guide covers the local setup, the conventions the codebase follows and what a good pull request looks like.

## Local development

| Part | Command | Notes |
|:--|:--|:--|
| Everything | `docker compose up --build -d` | Web on :5173, API on :8000, migrations run automatically |
| API only | `cd apps/api && pip install -c requirements.lock -e ".[test]" && uvicorn app.main:app --reload` | Needs PostgreSQL 16 with pgvector, `DATABASE_URL` and `JWT_SECRET` |
| API tests | `cd apps/api && TEST_DATABASE_URL=$DATABASE_URL pytest` | Database tests are skipped without `TEST_DATABASE_URL`; CI runs them all |
| Web only | `cd apps/web && npm ci && npm run dev` | Set `VITE_API_BASE_URL` when the API is not behind `/api` |
| End-to-end | `cd apps/web && npm run build && npx playwright test` | Starts the API, the built console and a fake model server; see `playwright.config.js` for the variables |
| Migrations | `cd apps/api && alembic revision -m "short description"` | One migration per schema change, never edit a merged one; enable row-level security on every new table |
| OpenAPI | `cd apps/api && python -m app.openapi_export ../../docs/api/openapi.json` | Commit the result when endpoints change (CI checks it) |
| Dependencies | `pip-audit -r apps/api/requirements.lock` and `npm audit` | Regenerate `requirements.lock` as described in its header |

## Conventions

- **Architecture.** Keep the modular monolith: one module per domain in `apps/api/app/`, one page per area in `apps/web/src/`. Record significant decisions as an ADR in `docs/architecture/`.
- **Tenancy.** Every endpoint that touches workspace data depends on `current_membership` and filters by organization. Add a test that a second workspace gets a 403.
- **Secrets.** Provider keys go through `crypto.encrypt`. Never log prompts, tokens or keys, and never return provider errors verbatim.
- **Model output.** Treat model output, retrieved documents and tool results as untrusted input and pass them through the guardrails.
- **Design.** Use the brand tokens in `apps/web/src/style.css` (Blue Night, Lime, Energy Yellow, Cloud White, Montserrat), lucide icons and gradients rather than flat fills. Respect `prefers-reduced-motion` for every animation.
- **Dependencies.** Avoid new ones. If one is needed, pin it, check its license is compatible with AGPL-3.0 and explain why in the pull request.
- **Copy.** Interface text is US English. Do not use a spaced em dash in user-facing text.
- **Accessibility.** Visible focus, a label for every field, WCAG AA contrast, keyboard access to every action, no horizontal scrolling at 360 px.

## Pull requests

1. Branch from `main` with a descriptive name such as `feat/knowledge-sync` or `fix/chat-retry`.
2. Describe the problem, the change, how you tested it and any security or migration impact.
3. Add screenshots for visible UI changes, on desktop and on a phone.
4. Keep CI green: API tests, migrations, audits, secret scan, web build, Docker images and the end-to-end suite.
5. Add an entry to `CHANGELOG.md` under the next version.

## Reporting security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## License

Contributions are made available under AGPL-3.0-only. By submitting a contribution you confirm you have the right to submit it under these terms.
