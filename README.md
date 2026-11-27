# Galdus.ai

**The Open AI Operating System.**

Galdus.ai is an independent, open-source, self-hostable AI platform for individuals, teams, and organizations. Its goal is to bring models, agents, knowledge, automation, and governance together behind one provider-neutral control plane.

> **Status:** early development. This repository is a foundation scaffold, not a production-ready platform. Roadmap items are not implemented capabilities.

## Product areas

- **Models** — connect hosted and self-hosted language models.
- **Agents** — build and operate task-oriented AI agents.
- **Knowledge** — manage searchable knowledge sources and retrieval.
- **Automation** — orchestrate workflows and integrations.
- **Governance** — apply access control, auditability, and operational policies.

## Architecture

The initial implementation is a modular monolith: React + Vite web console, FastAPI backend, LiteLLM model gateway, PostgreSQL, SQLAlchemy and Alembic migrations. The identity foundation includes user registration/login, password hashing, JWT access tokens, organizations and memberships. Agents, RAG, automation and full governance remain planned work.

## Quick start

1. Copy `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD` with a strong random password and `JWT_SECRET` with at least 32 random characters.
3. Start services: `docker compose up --build -d`.
4. Apply database migrations: `docker compose exec api alembic -c alembic.ini upgrade head`.
5. Open the web console at http://localhost:5173 and API docs at http://localhost:8000/docs.
6. Create an account from the web console; registration creates an organization/workspace for that account.

The web container serves the built frontend through Nginx on container port 80 (mapped to host port 5173) and proxies `/api/` to the backend. API identity endpoints: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, and `GET /api/v1/auth/organizations` (Bearer token required for the last two). The chat endpoint `POST /api/v1/chat/completions` also requires a valid Bearer token.

Configure provider credentials only in the backend `.env`. Never put secrets in browser code or commit `.env`.

## Desktop

The Tauri 2 desktop shell is under `apps/web/src-tauri`. Build it from `apps/web` with Rust and the platform prerequisites installed:

- `npm install`
- `npm run tauri build`

For a desktop build connected to a remote Galdus API, set `VITE_API_BASE_URL` to the API's public base URL at build time (for example, `https://api.example.com/api`). The default `/api` path is intended for the web frontend served behind the included Nginx proxy; it is not a remote API address for a standalone desktop installation. The desktop CI workflow can publish platform build artifacts after a successful GitHub Actions run; installers are not checked into this repository.

## Security warning

This scaffold is for local development only. It is not production-ready: add and test rate limiting, email verification, password reset, refresh-token/session revocation, brute-force protection, tenant-scoped authorization on every resource, security headers, audit trails, backups, monitoring and hardened deployment before exposing it publicly. The initial bearer tokens are short-lived JWTs but are not yet revocable.

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE) and [license compliance notes](docs/LICENSE-COMPLIANCE.md). Third-party components retain their own licenses.
