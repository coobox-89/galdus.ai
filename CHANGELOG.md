<p align="center"><img src="docs/assets/header-changelog.jpg" alt="Galdus.ai changelog" width="100%"></p>

# Changelog

## 0.9.1 (2026-11-27)

- Default profile picture: an anonymous Viking silhouette in Blue Night on the lime gradient, used everywhere a person appears (sidebar, profile, team, chat).
- Profile photo: squircle frame with a lime gradient ring, hover and drag-and-drop to change, editor framed like the final avatar.
- Provider logos: each provider tile shows its official logo when the file is added to `apps/web/public/brand/providers/` (recoloured to the platform palette); a monogram otherwise.

## 0.9.0 (2026-11-27)

- Two-step verification (opt-in, off by default): authenticator-app codes (TOTP, RFC 6238) with replay protection and ten single-use recovery codes. Guided setup with QR code; required on every sign-in, including Google and GitHub, once on.
- Profile card: editable photo with a drag-and-zoom editor (saved as a 256 px image), name, email with its verification status.
- Email verification at registration with a branded HTML email (also used for password reset and invitations), a reminder banner and "send again". `REQUIRE_EMAIL_VERIFICATION=true` blocks password sign-in until confirmed.
- Shared rate limits: `RATE_LIMIT_BACKEND=postgres` counts requests in the database, so limits hold across several API instances.
- End-to-end tests (Playwright) run on every push: register, connect a model, chat, knowledge, agents, automations, team invite and two-step sign-in.
- Final privacy policy, terms of service and acceptable use policy (GDPR), with the operator details set from repository variables. Retention promised there is enforced by the scheduler.
- API: `/api/v1/auth/mfa/*`, `/api/v1/auth/verify-email`, `/api/v1/auth/me/profile`, `/api/v1/auth/me/avatar`. Migration 0010.

## 0.8.0 (2026-11-27)

- Security review: sessions revoked on password change, password reset and the new "Sign out everywhere"; Google and GitHub sign-in bound to the browser that started it; only owners and admins change knowledge or use connected drives; chat images checked by file signature; dependency audit in CI.
- Automation wizard: task, trigger (schedule, webhook or both), delivery to Slack, Teams or any webhook with step-by-step guides, review, and a ready screen with the webhook address and "Try it now". Automations also get a "Run now" button.
- MCP server wizard: what MCP is, connect and list tools, choose allowed tools (actions that change data start off), ready.
- Platform admin, Setup: one card per operator feature (encryption key, admins, Google, GitHub, Microsoft, email, scheduler) with its status and a guided wizard: console steps, redirect URIs to copy, Render variables, check again.
- Cloud drives that are not enabled link platform admins straight to Setup.
- API: `POST /api/v1/automations/{id}/run`, `GET /api/v1/admin/setup` (names and addresses only, never secret values), `POST /api/v1/auth/logout-all`.

## 0.7.0 (2026-11-27)

- Branded dropdowns everywhere: every select in the console (assistant, model, knowledge, workspace, roles, agents, schedules) uses the Galdus design, with keyboard navigation, search on long lists and grouped options.
- One model menu in chat, agents and apps lists every model of every provider in the catalog. Connected providers work at once; any other model opens the connect wizard.
- Connect wizard: provider choice, illustrated steps to get the key with a link to the provider console, key check before saving with plain-language errors, and a ready screen that switches to the new model.
- Models page redesigned as a provider gallery with free-tier and self-hosted tags.
- API: `POST /api/v1/models/check` tests a key before it is stored.

## 0.6.1 (2026-11-27)

- Sign-in footer redesigned: logo with gradient tagline, legal links as pills (two by two on phones), early-access badge and copyright.
- Ultra-wide screens keep the whole warrior in view: the backdrop crop is capped, its edges feathered and the sides filled with a blurred copy of the scene.
- Arm motion stays on the arm: effects are masked to the traced arm silhouette, the glow and light wave follow the arm's own mesh and sparks twinkle on its nodes.
- The lime face stripe now ends above the beard with a smeared, powdery fade; the beard below is restored.
- Brand images (banner, page headers, social preview, sign-in screenshot) regenerated from the updated artwork.

## 0.6.0 (2026-11-27)

- New sign-in screen built on the brand artwork: full-bleed scene with legibility gradients, motion on the AI arm, snow and parallax, responsive from phones to wide screens.
- README and documentation redesigned with the brand identity: banner, animated logo, module overview, architecture diagram, page headers and screenshots.
- `SECURITY.md` with private vulnerability reporting, pull request and issue templates.
- `.env.example` documents every setting, including `ENCRYPTION_KEY`, OAuth, SMTP and the scheduler token.

## 0.5.0

- Sign in with Google and GitHub, password reset by email.
- Chat v2: streaming, attachments and images, personas, personal preferences, citations, pinned and searchable history.
- Google Drive, SharePoint and OneDrive connectors for knowledge.
- Design v2: gradients, sidebar icons, animated logo, command palette.

## 0.4.0

- Brand identity and UX redesign.
- Agents with tools, apps gallery, automations with schedules and webhooks, MCP integrations.
- Governance: roles, invitations, audit log, token limits, guardrails.

## 0.3.0

- Bring-your-own-key model connections for hosted and open-weight models.
- Knowledge collections with pgvector search.
- Platform admin console; free public preview on GitHub Pages, Render and Supabase.
