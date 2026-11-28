# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

import pytest
from fastapi import HTTPException

from app import chat
from app.config import settings
from app.ratelimit import SlidingWindowLimiter
from app.schemas import ChatRequest, Message


def test_resolve_model_defaults_to_server_model(monkeypatch):
    monkeypatch.setattr(settings, "litellm_model", "openai/gpt-4o-mini")
    monkeypatch.setattr(settings, "allowed_models", "")
    assert chat.resolve_model(None) == "openai/gpt-4o-mini"


def test_resolve_model_rejects_unlisted_model(monkeypatch):
    monkeypatch.setattr(settings, "litellm_model", "openai/gpt-4o-mini")
    monkeypatch.setattr(settings, "allowed_models", "openai/gpt-4o-mini")
    with pytest.raises(HTTPException) as exc:
        chat.resolve_model("ollama/llama3")
    assert exc.value.status_code == 400


def test_provider_without_key_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(HTTPException) as exc:
        chat.provider_kwargs("anthropic/claude-sonnet-4-5")
    assert exc.value.status_code == 503


def test_openai_key_is_passed_only_to_openai_models(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    assert chat.provider_kwargs("openai/gpt-4o-mini") == {"api_key": "sk-test"}
    monkeypatch.setattr(settings, "ollama_api_base", "http://ollama:11434")
    assert chat.provider_kwargs("ollama/llama3") == {"api_base": "http://ollama:11434"}


def test_conversation_total_size_is_bounded():
    with pytest.raises(ValueError):
        ChatRequest(messages=[Message(role="user", content="x" * 100000)] * 3)


def test_sliding_window_limiter():
    limiter = SlidingWindowLimiter()
    assert limiter.hit("k", 2) is None
    assert limiter.hit("k", 2) is None
    assert limiter.hit("k", 2) is not None
    assert limiter.hit("other", 2) is None
