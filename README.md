# Galdus.ai

**The Open AI Operating System.**

Galdus.ai is an open, modular AI operating system for individuals and organizations.

## Product areas

- **Models** — connect hosted and self-hosted language models.
- **Agents** — build and operate task-oriented AI agents.
- **Knowledge** — manage searchable knowledge sources and retrieval.
- **Automation** — orchestrate workflows and integrations.
- **Governance** — apply access control, auditability, and operational policies.

## Architecture direction

The initial implementation is intended to use a modular monolith with clear domain boundaries, with service extraction only when operational needs justify it.

Planned building blocks include React + Vite, FastAPI, PostgreSQL with pgvector, LiteLLM, and Docker Compose. These are architectural intentions, not a claim that every component is implemented.

## Status

Early-stage project. This repository is being initialized; do not treat it as production-ready.

## License

Intended license: **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**. The complete license text and third-party notices must be added before public distribution. Until then, this README is not a substitute for the license terms.
