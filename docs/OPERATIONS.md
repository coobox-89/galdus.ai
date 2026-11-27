<p align="center"><img src="assets/header-deployment.jpg" alt="Galdus.ai operations" width="100%"></p>

# Operations runbook

How to deploy, roll back, rotate secrets, back up and restore, monitor and handle incidents for the zero-cost setup (GitHub Pages, Render, Supabase). Setup B (Docker Compose) differs only where noted. First-time installation is in [DEPLOYMENT.md](DEPLOYMENT.md).

## Deploy

1. Merge the pull request into `main` after CI is green (tests, migrations, audits, secret scan, builds, end-to-end).
2. **Console**: the Pages workflow deploys automatically when `apps/web` changes. Watch **Actions, Deploy web to GitHub Pages**.
3. **API**: Render deploys `main` automatically (`autoDeploy: true`). The new container runs `alembic upgrade head` under an advisory lock, then starts. If migrations fail, the configuration is invalid or `/readyz` does not answer, Render keeps the previous version live.
4. Check:

   ```bash
   curl -s https://galdus-api.onrender.com/health    # version is the new one
   curl -s https://galdus-api.onrender.com/readyz    # "migrations":"ok"
   ```

5. Tag the release (this publishes the GitHub release with the CHANGELOG section):

   ```bash
   git checkout main && git pull
   git tag v1.0.0-rc.1 && git push origin v1.0.0-rc.1
   ```

   The tag must match `apps/api/app/version.py`; tags with a hyphen are published as pre-releases.

Docker Compose: `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.

### Migrations, safely

- Every migration must be backwards compatible with the version still running for a few minutes: add columns as nullable or with a default, never rename or drop in the same release that stops using them (drop one release later).
- CI runs `upgrade`, `downgrade base`, `upgrade` and `alembic check` (no drift between models and migrations) on an empty database.
- Take a backup before a release with migrations that change or delete data.
- `/readyz` returns 503 while the database is behind the code ("migrations pending"), so a half-applied deploy never receives traffic.

## Roll back

| What | How |
|:--|:--|
| API, code only | Render, `galdus-api`, **Events**, pick the previous successful deploy, **Rollback**. Or revert the commit on `main` and let it redeploy. |
| API with a migration | Prefer rolling forward with a fix. If you must go back: `alembic downgrade <previous revision>` from a machine with `DATABASE_URL` set (run it before rolling back the code), then roll back the deploy. Migration 0011 (tour) is safe to downgrade; it only drops two columns. |
| Console | Revert the commit on `main` (the Pages workflow redeploys), or **Actions, Deploy web to GitHub Pages, Re-run** on an older successful run. |
| Docker Compose | `git checkout <previous tag>` and `up -d --build`; downgrade migrations first if needed (`docker compose run --rm api alembic downgrade <revision>`). |

## Rotate secrets

Rotate at least once a year, immediately when someone with access leaves, and whenever a value may have leaked. Generate values with `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.

| Secret | Where | Steps | Effect |
|:--|:--|:--|:--|
| Supabase database password (`galdus_app`) | Supabase SQL Editor, Render | `alter role galdus_app with password '<new>';` then update `DATABASE_URL` on Render and save (restart). | A few seconds of errors during the restart. |
| Supabase `postgres` (dashboard) password | Supabase, **Database, Settings, Reset database password** | Store it in your password manager; the API does not use it. | None for users. |
| `JWT_SECRET` | Render | Replace the value and save. | Everyone is signed out once. |
| `ENCRYPTION_KEY` | Render | **Do not just replace it**: stored provider keys, drive tokens, MCP headers and two-step secrets would become unreadable. Planned rotation: announce it, ask workspaces to re-enter keys and reconnect drives, people with two-step verification to turn it off and on again, then change the value. If it leaked: change it at once and follow the same steps. | Encrypted data must be re-entered. |
| `AUTOMATION_TOKEN` | Render and GitHub secret `GALDUS_AUTOMATION_TOKEN` | Set the same new value in both. | Schedules pause until both match. |
| OAuth client secrets | Google Cloud, GitHub, Microsoft Entra, then Render | Create a new secret, update Render, then delete the old secret at the provider. | None if done in this order. |
| SMTP password | Your SMTP provider, then Render | Create a new credential, update Render, revoke the old one. | Emails pause during the switch. |
| Temporary admin password | The console | Sign in, **Account, Change password** (this signs out other devices), then turn on two-step verification. | None. |

## Backups

Supabase free has no downloadable backups, so take your own. The scripts were exercised end to end (dump, encrypted copy, restore into an empty database, row counts, migration head, RLS check, API readiness on the restored copy).

Weekly, from your computer (needs `pg_dump` 16 and `gpg`):

```bash
export DATABASE_URL='postgresql://galdus_app.<ref>:<password>@<pooler-host>:5432/postgres?sslmode=require'
export BACKUP_PASSPHRASE='<long passphrase from your password manager>'
./scripts/backup-db.sh ~/galdus-backups
```

Keep the last 4 weekly copies (about 30 days) in two places (for example your disk and a private cloud folder) and delete older ones: the privacy policy promises that a deleted account disappears from backups within 30 days. Store `ENCRYPTION_KEY` and `BACKUP_PASSPHRASE` in your password manager, not next to the file. Before a risky release, take an extra backup.

Docker Compose: `docker compose exec db pg_dump -U galdus -Fc galdus > galdus-$(date +%F).dump`, or run the script against the published database.

### Restore drill (every quarter) and real restore

1. Create an **empty** target: a new Supabase project (enable `vector`, create `galdus_app` as in [DEPLOYMENT.md](DEPLOYMENT.md#a1-database-on-supabase)) or a local PostgreSQL 16 with pgvector.
2. Restore and check:

   ```bash
   export TARGET_DATABASE_URL='postgresql://...empty database...'
   export BACKUP_PASSPHRASE='...'
   ./scripts/restore-db.sh ~/galdus-backups/galdus-<stamp>.dump.gpg
   ```

   The script refuses a database that already has Galdus tables and prints the migration revision, user and workspace counts and the number of tables without RLS (must be 0).
3. For a real restore, point `DATABASE_URL` on Render at the restored database (with the same `ENCRYPTION_KEY`), save, and check `/readyz`.

## Monitoring and alerts

| Signal | Where | Alert |
|:--|:--|:--|
| Uptime and readiness | `.github/workflows/uptime.yml` checks `/readyz` every 10 minutes (which also keeps the free instance awake) | Opens an issue labelled `incident` (GitHub notifies you) and closes it when the API is back. Make sure **Watch** is on for the repository and GitHub notifications reach your email or phone. |
| Errors | Render **Logs**: JSON lines; filter `"level":"error"` or `"status":5` | Optional: a free log drain or Render notifications for failed deploys (**Settings, Notifications**). |
| Request tracing | Every response has `X-Request-ID`; error bodies include `request_id` | Ask users for it and search the logs. |
| Scheduler | **Actions, Automation scheduler** runs | GitHub emails you when a scheduled workflow fails. |
| Database | Supabase **Reports** (size, connections) and **Advisors** | Check monthly; act before 400 MB on the free plan. |
| Dependencies | CI `pip-audit` and `npm audit` on every pull request; Dependabot alerts in **Security** | Fix high and critical within 7 days. |

Optional, also free: an external uptime service (for example UptimeRobot) on `/health` every 5 minutes, which keeps the instance awake even when GitHub delays its schedules. One always-awake free service uses about 744 of Render's 750 free hours a month: do not run a second free service in the same Render workspace.

## Incidents

1. **Acknowledge**: comment on the `incident` issue (or open one) with the time and the symptom.
2. **Triage**:
   - `/health` fails: Render is down or the instance crashed; check Render **Events** and **Logs**.
   - `/health` works, `/readyz` fails with "Database is not ready": Supabase is paused, over quota or the password changed; check the Supabase dashboard.
   - `/readyz` says "migrations pending": a deploy did not finish migrating; run `alembic upgrade head` or roll back.
   - Errors for one feature: search the logs by route or `request_id`; check the provider's status page (model providers, Google, Microsoft, SMTP).
3. **Mitigate**: roll back (see above), restart the service, or turn the feature off by clearing its variables.
4. **Security incident** (leaked secret, suspicious sign-ins, data exposure): rotate the affected secrets now (table above); for leaked user sessions rotate `JWT_SECRET`; review the workspace **Team, Audit log** and the Render logs; if personal data may be affected, assess within 72 hours whether you must notify the supervisory authority (GDPR art. 33) and the people affected (art. 34).
5. **Close**: write what happened, the impact, the cause and the follow-ups in the issue; add a test for the cause.

## Routine

| When | Task |
|:--|:--|
| Weekly | Backup; glance at the `incident` issues and Render logs |
| Monthly | Supabase size and advisors; Dependabot alerts; review platform admins in the console |
| Quarterly | Restore drill; review who has access to Render, Supabase and GitHub |
| Yearly | Rotate secrets; review the legal pages |
