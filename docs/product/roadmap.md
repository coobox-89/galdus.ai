<p align="center"><img src="../assets/header-roadmap.jpg" alt="Galdus.ai roadmap" width="100%"></p>

# Roadmap

Galdus.ai 1.0.0-rc.1 is the release candidate for 1.0, running as a public preview. This page separates what ships today from what is planned. Planned items are direction, not commitments.

## Shipped in 1.0.0-rc.1

| Area | Available today |
|:--|:--|
| Identity | Email and password with email verification, Google, GitHub and Microsoft sign-in, optional two-step verification, account lockout, profile photo, password reset, sign out everywhere, data export, account deletion |
| Chat | Streaming answers, attachments and images, assistant personas, personal preferences, knowledge grounding with citations, pinned and searchable history |
| Models | Bring your own key for twelve provider types, including any OpenAI-compatible endpoint; one menu with every model; a guided connect wizard that tests the key before saving; keys encrypted at rest |
| Knowledge | Uploads, web pages, Google Drive, SharePoint and OneDrive; pgvector semantic search with keyword fallback; daily drive re-sync |
| Agents and apps | Reusable agents with tools and knowledge; eight built-in apps; every run stored with its steps |
| Automation | Guided wizard; cron schedules, inbound webhooks, delivery to Slack or Teams; run now |
| Integrations | MCP server wizard with tool allowlists; built-in tools |
| Governance | Roles, invitations, audit log, monthly token limits, guardrails, platform admin console with a guided Setup page |
| Experience | First-run guided tour (replayable), brand design with motion, responsive from 360 px to ultra-wide screens, command palette, desktop shell |
| Operations | Health and readiness checks, JSON logs with request ids, uptime alerts, encrypted backups with a tested restore, tagged releases, Docker Compose production setup |

## Next

| Horizon | Focus |
|:--|:--|
| Near term | 1.0 after the owner checklist; passkeys (WebAuthn), a workspace policy that requires two-step verification, container image scanning and SBOM, DNS-pinned outbound requests |
| Mid term | Approval steps for consequential agent actions, scoped agent memory, retries and human tasks in automations, usage dashboards per model and per user |
| Later | Single sign-on (SAML, OIDC) for enterprise workspaces, deployment profiles for teams and regulated environments, plugin marketplace for apps and connectors |

Ideas and requests are welcome as GitHub issues.
