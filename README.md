<p align="center">
  <a href="https://coobox-89.github.io/galdus.ai/"><img src="docs/assets/banner.jpg" alt="Galdus.ai, the AI operating system" width="100%"></a>
</p>

<p align="center">
  <img src="docs/assets/logo-animated.svg" alt="" width="84">
</p>

<h3 align="center">The open source AI operating system.<br>Bring any model. Keep your data.</h3>

<p align="center">
  <a href="https://coobox-89.github.io/galdus.ai/"><img alt="Live preview" src="https://img.shields.io/badge/live%20preview-open-B6FF00?style=for-the-badge&labelColor=0B1F3B"></a>
  <a href="LICENSE"><img alt="License AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-F8FAFC?style=for-the-badge&labelColor=0B1F3B"></a>
  <a href="CHANGELOG.md"><img alt="Version 1.0.0-rc.1" src="https://img.shields.io/badge/version-1.0.0--rc.1-FFC107?style=for-the-badge&labelColor=0B1F3B"></a>
  <a href="https://github.com/coobox-89/galdus.ai/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/coobox-89/galdus.ai/ci.yml?branch=main&style=for-the-badge&label=ci&labelColor=0B1F3B&color=3FD47A"></a>
</p>

<p align="center">
  <a href="#what-is-inside">Modules</a> ·
  <a href="#see-it">Screens</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/DEPLOYMENT.md">Deploy</a> ·
  <a href="docs/README.md">Docs</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<br>

Galdus.ai brings models, knowledge, agents, automation and governance together in one workspace you can host yourself. It is model agnostic by design: every workspace connects its own providers with its own keys, from OpenAI and Anthropic to open-weight models such as Qwen, DeepSeek, Llama and Mistral running on your own hardware.

> [!NOTE]
> **Release candidate.** Galdus.ai 1.0.0-rc.1 runs as a free public preview on GitHub Pages, Render and Supabase. The free API sleeps when idle, so the first request after a pause can take up to a minute. What is left before 1.0 is in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## What is inside

<p align="center"><img src="docs/assets/modules.jpg" alt="The nine Galdus.ai modules" width="100%"></p>

| Module | What you can do |
|:--|:--|
| **Chat** | Stream answers from any connected model, attach files and images, pick an assistant persona, ground replies in a knowledge collection with citations, pin and search past chats. |
| **Models** | Connect OpenAI, Anthropic, Gemini, Mistral, DeepSeek, OpenRouter, Groq, Together, Fireworks, xAI, Ollama or any OpenAI-compatible endpoint (vLLM, LM Studio, TGI). Type any model name. Keys are encrypted at rest. |
| **Knowledge** | Build collections from uploads, public web pages, Google Drive and SharePoint or OneDrive. Semantic search with pgvector when an embedding model is set, keyword search otherwise. |
| **Agents** | Combine instructions, a model, knowledge and tools into a reusable assistant. Every run is stored with its steps and tool calls. |
| **Apps** | Eight ready tools: chat with documents, summarize, rewrite tone, draft an email, IT ticket triage, contract review, meeting notes to actions, translate. |
| **Automation** | Run agents on a cron schedule or from an inbound webhook (n8n, Make, Zapier, ITSM tools) and deliver results to Slack or Teams. |
| **Integrations** | Connect MCP servers over Streamable HTTP with a per-tool allowlist, use built-in tools (calculator, date and time, web fetch, knowledge search) and link cloud drives. |
| **Governance** | Owner, admin and member roles, invitation links, audit log, monthly token limits, prompt-injection guardrails and a platform admin console with guided setup. |
| **Security** | Sign in with email, Google, GitHub or Microsoft; optional two-step verification; email verification; account lockout; session revocation; data export and self-service deletion. AGPL-3.0, self-hostable, PostgreSQL with row-level security. |
| **Onboarding** | A seven-step guided tour at the first sign-in, skippable and replayable from Account, plus wizards for every setting you have to configure. |

## See it

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screens/sign-in.jpg" alt="Sign-in screen"><p align="center"><b>Sign in</b> with email, Google, GitHub or Microsoft</p></td>
    <td width="50%"><img src="docs/assets/screens/home.jpg" alt="Workspace home"><p align="center"><b>Home</b> with guided setup and live usage</p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/assets/screens/tour.jpg" alt="First-run tour"><p align="center"><b>Tour</b> at the first sign-in</p></td>
    <td width="50%"><img src="docs/assets/screens/chat.jpg" alt="Chat with citations"><p align="center"><b>Chat</b> grounded in your documents</p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/assets/screens/apps.jpg" alt="Apps gallery"><p align="center"><b>Apps</b> for everyday work</p></td>
    <td width="50%"><img src="docs/assets/screens/integrations.jpg" alt="Integrations"><p align="center"><b>Integrations</b> with MCP and cloud drives</p></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/assets/screens/account.jpg" alt="Account and security" width="50%"><p align="center"><b>Account</b>, security and personal chat preferences</p></td>
  </tr>
</table>

## Quick start

You need Docker with Compose.

```bash
git clone https://github.com/coobox-89/galdus.ai.git && cd galdus.ai
cp .env.example .env          # set POSTGRES_PASSWORD, JWT_SECRET and ENCRYPTION_KEY
docker compose up --build -d  # database migrations run automatically
```

Open the console at http://localhost:5173 and the API reference at http://localhost:8000/docs. Create an account: registration also creates your workspace and starts a short tour. Then open **Models**, connect a provider with your key and start chatting. The [user guide](docs/USER_GUIDE.md) walks through every module.

For a production server with HTTPS, add the overlay: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` ([DEPLOYMENT.md](docs/DEPLOYMENT.md#b-one-server-with-docker-compose)).

Secrets live only in the backend `.env` or in your hosting provider's secret store. Never put them in browser code, `VITE_*` variables or commits.

## Architecture

<p align="center"><img src="docs/assets/architecture.jpg" alt="Galdus.ai architecture" width="100%"></p>

A modular monolith keeps development and hosting simple while the product grows ([ADR 0001](docs/architecture/0001-modular-monolith.md)).

| Layer | Stack |
|:--|:--|
| Web and desktop | React 18, Vite, motion, lucide icons, Montserrat; Tauri 2 desktop shell in `apps/web/src-tauri` |
| API | FastAPI, SQLAlchemy async, Alembic, server-sent events for streaming |
| Models | LiteLLM with per-workspace encrypted provider keys (Fernet) |
| Data | PostgreSQL 16 with pgvector and row-level security |
| Scheduling | croniter, woken every 15 minutes by a GitHub Actions workflow |
| Operations | JSON logs with request ids, `/health` and `/readyz` (database and migrations), uptime workflow with automatic incident issues, tagged releases |

Components and the main flows (sign-in, chat, knowledge, automations) are drawn in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deploy

The public preview runs at zero cost on GitHub Pages (web), Render free (API) and Supabase free (database). [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) covers the production build, every environment variable, Google, GitHub and Microsoft sign-in, SMTP, the free-plan limits and a Docker Compose alternative; [docs/OPERATIONS.md](docs/OPERATIONS.md) covers deploys, rollbacks, secret rotation, backups and incidents.

## Desktop

From `apps/web`, with Rust and the platform prerequisites installed, run `npm install` and `npm run tauri build`. Set `VITE_API_BASE_URL` to your API's public URL (for example `https://api.example.com/api`) at build time. CI publishes desktop builds as workflow artifacts.

## Brand

| | Color | Hex |
|:--:|:--|:--|
| <img src="https://img.shields.io/badge/%20-%20-0B1F3B?style=flat-square" alt=""> | Blue Night | `#0B1F3B` |
| <img src="https://img.shields.io/badge/%20-%20-B6FF00?style=flat-square" alt=""> | Lime | `#B6FF00` |
| <img src="https://img.shields.io/badge/%20-%20-FFC107?style=flat-square" alt=""> | Energy Yellow | `#FFC107` |
| <img src="https://img.shields.io/badge/%20-%20-F8FAFC?style=flat-square" alt=""> | Cloud White | `#F8FAFC` |

Typeface: Montserrat. Logo files: [`logo.svg`](docs/assets/logo.svg) and [`logo-animated.svg`](docs/assets/logo-animated.svg).

## Documentation

| Guide | |
|:--|:--|
| [User guide](docs/USER_GUIDE.md) | Every module, step by step, for people using Galdus |
| [Architecture](docs/ARCHITECTURE.md) | Components and the main flows |
| [Deployment](docs/DEPLOYMENT.md) | Production build, environment variables, sign-in providers, free-plan limits, Docker Compose |
| [Operations](docs/OPERATIONS.md) | Deploy, rollback, secret rotation, backups, monitoring, incidents |
| [API](docs/API.md) | Conventions, examples and every endpoint; OpenAPI in [docs/api/openapi.json](docs/api/openapi.json) |
| [Security](docs/security/overview.md) | Implemented controls, the [latest review](docs/security/review-2026-11-27.md), how to report a vulnerability |
| [Release checklist](docs/RELEASE_CHECKLIST.md) | Verdict and the steps left before 1.0 |
| [Roadmap](docs/product/roadmap.md) | What ships today and what comes next |
| [Decision records](docs/architecture/0001-modular-monolith.md) | Why a modular monolith |
| [Changelog](CHANGELOG.md) | Release history |
| [License compliance](docs/license-compliance.md) | AGPL-3.0 obligations before each release |
| [Project handoff](docs/HANDOFF.md) | Full context for a developer continuing the work |

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

Copyright (C) 2026 Mario Cubello. Galdus.ai is created and maintained by **Mario Cubello**.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, version 3 only (`AGPL-3.0-only`). It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) and the [license compliance notes](docs/license-compliance.md). Third-party components keep their own licenses.

## Trademarks

OpenAI, Claude, Anthropic, Gemini, Mistral, DeepSeek, OpenRouter, Groq, Together AI, Fireworks AI, xAI, Ollama and all other product names, logos and brands mentioned are the property of their respective owners. Galdus.ai is an independent, open-source project. It is not affiliated with, sponsored by, endorsed by or otherwise connected to any of them. Third-party names and logos are used for identification purposes only, to indicate compatibility with their services. Provider logos in [`apps/web/public/brand/providers`](apps/web/public/brand/providers) are excluded from the AGPL-3.0 license and remain the property of their owners.

<p align="center"><br><img src="docs/assets/logo.svg" alt="" width="36"><br><sub><b>Galdus.ai</b> · Powered by you. Supercharged by AI.</sub></p>
