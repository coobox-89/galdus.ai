# Public MVP deployment

This repository is not a one-click production deployment yet. The supported first public topology is:

- Netlify: React/Vite static frontend.
- A managed container host: FastAPI API image from `apps/api/Dockerfile`.
- Managed PostgreSQL: persistent database with backups.

## 1. Deploy the API and database

Create a PostgreSQL database and a container service from this repository. Configure the API service to build from `apps/api/Dockerfile`, listen on port `8000`, and use these environment variables:

- `DATABASE_URL`: SQLAlchemy async URL, for example `postgresql+asyncpg://USER:PASSWORD@HOST:5432/DBNAME?ssl=require` (use the exact TLS options required by your provider).
- `JWT_SECRET`: cryptographically random secret, at least 32 characters; use 48+ random bytes.
- `CORS_ORIGINS`: exact public Netlify site origin, e.g. `https://YOUR-SITE.netlify.app`; no trailing slash.
- `OPENAI_API_KEY`: provider key, kept only on the API service.
- `LITELLM_MODEL`: model identifier supported by LiteLLM, e.g. `openai/gpt-4o-mini`.

Do not commit secrets or put provider keys in Netlify frontend variables.

After the API is reachable, run database migrations once using the same image and environment:

```bash
alembic -c alembic.ini upgrade head
```

Verify:
- `GET /health` returns service status.
- `GET /readyz` returns HTTP 200 only when PostgreSQL accepts a query.
- `GET /docs` is available for API inspection; disable public docs in a hardened production launch if not needed.

## 2. Deploy the frontend on Netlify

1. Import `coobox-89/galdus.ai` from GitHub in Netlify.
2. Netlify reads `netlify.toml`: base directory `apps/web`, build command `npm run build`, publish directory `dist`.
3. Add build environment variable `VITE_API_BASE_URL` with the API base URL ending in `/api`, e.g. `https://YOUR-API-HOST/api`.
4. Deploy and open the generated `.netlify.app` URL.
5. Add that exact origin to the API's `CORS_ORIGINS`, then redeploy/restart the API.

The frontend uses the same API paths for auth and chat. The API base URL is public configuration; never put secrets in `VITE_*` variables.

## 3. Smoke test before inviting users

- Register a new account with a unique email and a password of at least 12 characters.
- Sign out and sign back in.
- Reload the page and verify session restoration.
- Call `GET /api/v1/auth/organizations` with the session bearer token and verify only the user's workspace is returned.
- Send a chat prompt and confirm a real model response.
- Verify a second account cannot see the first account's organization.
- Check API logs and database backup configuration.

## 4. Production limitations

The current MVP still needs rate limiting/brute-force controls, email verification, password reset, revocable sessions/refresh tokens, tenant-scoped authorization for future resources, audit logging, monitoring, automated backup/restore drills, and security review. Do not market the current scaffold as a fully hardened enterprise service.

The Netlify site and the API/database are separate services. Netlify hosts the frontend; it does not automatically host the existing FastAPI container or PostgreSQL database.
