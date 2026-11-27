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

API identity endpoints: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, and `GET /api/v1/auth/organizations` (Bearer token required for the last two).

Configure provider credentials only in the backend `.env`. Never put secrets in browser code or commit `.env`.

## Security warning

This scaffold is for local development only. It is not production-ready: add and test rate limiting, email verification, password reset, refresh-token/session revocation, brute-force protection, tenant-scoped authorization on every resource, security headers, audit trails, backups, monitoring and hardened deployment before exposing it publicly. The initial bearer tokens are short-lived JWTs but are not yet revocable.

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE) and [license compliance notes](docs/LICENSE-COMPLIANCE.md). Third-party components retain their own licenses.
