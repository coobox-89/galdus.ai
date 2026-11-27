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

The initial implementation is a modular monolith: React + Vite web console, FastAPI backend, LiteLLM model gateway, and Docker Compose for local development. PostgreSQL/pgvector, identity, durable workflows, and the other domains remain planned work.

## Quick start

1. Copy `.env.example` to `.env`.
2. Start Docker Compose: `docker compose up --build`.
3. Open the web console at http://localhost:5173.
4. API health check: http://localhost:8000/health and docs: http://localhost:8000/docs.

Configure provider credentials only in the backend `.env`. Never put secrets in browser code or commit `.env`.

## Security warning

This scaffold is for local development only. Do not expose it to the public internet as-is. Authentication, authorization, tenant isolation, rate limiting, secret management, audit logging, sandboxing, and hardened deployment controls must be implemented and tested before production use.

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE) and [license compliance notes](docs/LICENSE-COMPLIANCE.md). Third-party components retain their own licenses.
