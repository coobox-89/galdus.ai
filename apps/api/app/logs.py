# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Structured logging.

LOG_FORMAT=json (default) writes one JSON object per line, which Render, Docker and most log drains
index directly. Request logs carry the route template (e.g. /api/v1/hooks/{token}), never the raw path
or query string, so tokens, OAuth codes and search terms do not end up in logs. Prompts, messages and
document text are never logged.
"""
import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

request_id: ContextVar[str] = ContextVar("request_id", default="")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {"ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
                "level": record.levelname.lower(), "logger": record.name, "msg": record.getMessage()}
        rid = request_id.get()
        if rid:
            data["request_id"] = rid
        for key, value in getattr(record, "fields", {}).items():
            data[key] = value
        if record.exc_info:
            data["error"] = record.exc_info[0].__name__ if record.exc_info[0] else "Exception"
            data["traceback"] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False, default=str)


def configure(fmt: str = "json", level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if fmt == "json" else logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # Libraries that log full URLs (with query strings) or payloads at INFO/DEBUG stay quiet.
    for noisy in ("LiteLLM", "litellm", "httpx", "httpcore", "httpx2", "mcp", "uvicorn.access", "alembic"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").disabled = True
