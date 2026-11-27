FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY pyproject.toml alembic.ini ./
COPY app ./app
COPY migrations ./migrations
RUN pip install . && useradd --create-home --uid 10001 galdus
USER galdus
EXPOSE 8000
# PORT is injected by hosts such as Render. FORWARDED_ALLOW_IPS (read by uvicorn)
# must list the trusted reverse proxy so client IPs used for rate limiting are real.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --no-server-header"]
