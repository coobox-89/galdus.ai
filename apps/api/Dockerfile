FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY pyproject.toml requirements.lock alembic.ini ./
COPY app ./app
COPY migrations ./migrations
# Exact versions from requirements.lock (constraints), so every build installs what CI tested.
RUN pip install -c requirements.lock . && useradd --create-home --uid 10001 galdus
USER galdus
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '8000'), timeout=4)" || exit 1
# RUN_MIGRATIONS_ON_START=true applies Alembic migrations before serving; use it only
# with a single instance (e.g. Render free plan without a pre-deploy step). The migration
# takes a Postgres advisory lock, so two instances starting together cannot both migrate.
# PORT is injected by hosts such as Render. FORWARDED_ALLOW_IPS (read by uvicorn)
# must list the trusted reverse proxy so client IPs used for rate limiting are real.
# Access logs come from the app (route templates, no query strings), so uvicorn's are off.
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS_ON_START\" = true ]; then alembic upgrade head || exit 1; fi; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --no-server-header --no-access-log"]
