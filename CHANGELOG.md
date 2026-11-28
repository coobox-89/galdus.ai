<p align="center"><img src="docs/assets/header-changelog.jpg" alt="Galdus.ai changelog" width="100%"></p>

# Changelog

## [Unreleased]

### Changed

- HD Viking artwork. Sign-in: the new illustration replaces the reconstructed one (no more blurred patch on the right), registered to the same framing so the glow, sweep and sparks stay on the arm; the arm mask and the 70 spark points are traced again from the new image. Home: a larger cutout of the Viking with his phone (900 px instead of 393 px).
- Home scene motion: the Viking fades and rises in, then floats gently; the lime halo breathes; the photo fades into the page at the belt. All of it stays still with reduced motion.
- Home scene: the lime rim light follows the Viking's outline and fades into the background, instead of being clipped to the rectangle of the photo.
- README screenshots of the sign-in page and Home updated.

## [1.0.0-rc.1] (2026-11-27)

Release candidate after the production-readiness review ([security review](docs/security/review-2026-11-27.md), [release checklist](docs/RELEASE_CHECKLIST.md)).

### Security

- Per-account lockout: 5 wrong passwords or 10 wrong second-factor codes in 15 minutes return 429, whatever the IP.
- `ADMIN_EMAILS` grants the platform console only to a confirmed address in production.
- Cloud-drive connections are completed by the signed-in session that started them (`POST /api/v1/connectors/{provider}/complete`), so a consent link cannot attach someone's drive to another workspace.
- Sign in with Microsoft. New accounts only; never linked to an existing account by email. A password reset drops sign-ins linked before the address was proven.
- With `REQUIRE_EMAIL_VERIFICATION` and SMTP, registration answers the same for new and existing addresses (202) and notifies the real owner.
- Webhooks: 400/422 on malformed bodies, 10 calls a minute per automation. Forgot-password: 3 emails per address per hour; using a reset link revokes the others. PDF and text uploads checked by content.
- Content Security Policy on the API and the console; COOP; SQL parameters hidden from logs; JSON logs with route templates only (no tokens, codes or query strings); uniform error bodies with a request id.
- Production refuses a missing `ENCRYPTION_KEY`, placeholder or development secrets, `ENCRYPTION_KEY` equal to `JWT_SECRET`, non-https public URLs, `SMTP_HOST` without `SMTP_FROM` and disabled rate limits.
- Account deletion works for accounts without a password (confirm with your email) and never leaves a shared workspace without an owner. The export (format 2) adds conversations, runs and linked sign-ins.
- A test fails if any table lacks row-level security. gitleaks on the whole history and blocking `pip-audit` and `npm audit` in CI.

### Added

- First-run guided tour: seven steps (Home, models, chat, knowledge, agents, automations, account), spotlight on the item explained, Back, Next, Skip, keyboard and focus trap, reduced motion, bottom sheet on phones. Saved on the account (migration 0011, `GET/PUT /api/v1/auth/onboarding`); **Replay the tour** in Account.
- Version shown in the sidebar and in Account (console and API); `/health` and `/readyz` report it, `/readyz` also reports pending migrations.
- Migrations take a Postgres advisory lock.
- `docker-compose.prod.yml` with Caddy (automatic HTTPS) for a single server; nginx security headers for the console image.
- `scripts/backup-db.sh` and `scripts/restore-db.sh` (encrypted backups, restore into an empty database with checks), exercised end to end.
- Workflows: tagged releases from the CHANGELOG (`release.yml`), uptime check with automatic incident issues (`uptime.yml`), secret scan and Docker web image in CI, OpenAPI drift check.
- Documentation: [Architecture](docs/ARCHITECTURE.md), [Operations](docs/OPERATIONS.md), [API](docs/API.md) with the generated [OpenAPI document](docs/api/openapi.json), [User guide](docs/USER_GUIDE.md), rewritten [Deployment](docs/DEPLOYMENT.md) with every variable, updated screenshots.

### Changed

- API dependencies pinned with `apps/api/requirements.lock`; both packages declare `AGPL-3.0-only`; Vite moved to development dependencies.
- Interface copy in US English throughout ("Personalize", "organized", "neutralize", "canceled"); legal texts unchanged.
- Small print (`--faint`) is slightly lighter for WCAG AA contrast (5.1:1).
- Checkboxes drawn in the platform style (Blue Night box, lime check, lime focus ring) instead of the operating system's native look; native rendering is kept only in Windows high-contrast mode.
- Backups kept for about 30 days (4 weekly copies), matching the privacy policy's promise on deleted accounts.
- Platform models are offered only when the server holds their credentials: with `ALLOWED_MODELS` set and `OPENAI_API_KEY` empty, the chat no longer shows an "OpenAI" model that cannot answer, and shows "Connect a model" instead.
- Chat errors are shown inside the reply ("No answer" with the reason and a shortcut to Models), not only as a toast.
- Faster sign-in on small instances: Argon2id with OWASP's minimum parameters (19 MiB, 2 iterations, 1 lane), about six times less CPU; older hashes are upgraded at the next sign-in.
- The uptime check runs every 10 minutes, which also keeps the free Render instance awake.
- Two-step verification: the QR code can be scanned again (it was cropped by its box because the SVG had a fixed size and no viewBox; it now scales and has the full quiet zone, on a white background).
- Deleting an account now signs out to the sign-in page with a confirmation.

### Fixed

- Team page no longer scrolls sideways on phones and tablets; the Chat page has a heading; valid roles on the Apps picker; the photo input has a label; no 404 requests for missing sign-in marks.
- Opening `#/admin` without platform admin rights lands on Home instead of failing requests.
- Flaky shared rate-limit test.

### Removed

- Unused code and files: the previous landing page styles and `Swoosh` component, `initialsOf`, a stray `pgvector` wheel, the Netlify configuration (the console is hosted on GitHub Pages).

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
