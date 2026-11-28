# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

"""Catalog of model providers users can connect with their own keys (BYOK).

Model names are free text: the catalog only supplies the LiteLLM prefix,
whether a key or base URL is required, and a few non-binding suggestions.
"""
import ipaddress
import re
import socket
from urllib.parse import urlparse

from fastapi import HTTPException

PROVIDERS: dict[str, dict] = {
    "openai": {"label": "OpenAI", "prefix": "openai", "key": True, "base_url": False,
               "suggestions": ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "o4-mini"]},
    "anthropic": {"label": "Anthropic", "prefix": "anthropic", "key": True, "base_url": False,
                  "suggestions": ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"]},
    "gemini": {"label": "Google Gemini", "prefix": "gemini", "key": True, "base_url": False,
               "suggestions": ["gemini-2.5-flash", "gemini-2.5-pro"]},
    "mistral": {"label": "Mistral AI", "prefix": "mistral", "key": True, "base_url": False,
                "suggestions": ["mistral-large-latest", "mistral-small-latest", "open-mistral-nemo"]},
    "deepseek": {"label": "DeepSeek", "prefix": "deepseek", "key": True, "base_url": False,
                 "suggestions": ["deepseek-chat", "deepseek-reasoner"]},
    "openrouter": {"label": "OpenRouter (open-weight & hosted)", "prefix": "openrouter", "key": True, "base_url": False,
                   "suggestions": ["qwen/qwen-2.5-72b-instruct", "deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct",
                                   "mistralai/mistral-large", "anthropic/claude-sonnet-4.5", "openai/gpt-4o-mini"]},
    "groq": {"label": "Groq", "prefix": "groq", "key": True, "base_url": False,
             "suggestions": ["llama-3.3-70b-versatile", "qwen/qwen3-32b"]},
    "together_ai": {"label": "Together AI", "prefix": "together_ai", "key": True, "base_url": False,
                    "suggestions": ["Qwen/Qwen2.5-72B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3", "meta-llama/Llama-3.3-70B-Instruct-Turbo"]},
    "fireworks_ai": {"label": "Fireworks AI", "prefix": "fireworks_ai", "key": True, "base_url": False,
                     "suggestions": ["accounts/fireworks/models/qwen2p5-72b-instruct", "accounts/fireworks/models/deepseek-v3"]},
    "xai": {"label": "xAI", "prefix": "xai", "key": True, "base_url": False, "suggestions": ["grok-3", "grok-3-mini"]},
    "ollama": {"label": "Ollama (self-hosted)", "prefix": "ollama_chat", "key": False, "base_url": True,
               "suggestions": ["qwen2.5:7b", "llama3.1:8b", "deepseek-r1:8b", "mistral:7b"]},
    "openai_compatible": {"label": "OpenAI-compatible endpoint (vLLM, LM Studio, TGI…)", "prefix": "openai", "key": False,
                          "base_url": True, "suggestions": ["Qwen/Qwen2.5-7B-Instruct", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"]},
}

MODEL_NAME = re.compile(r"^[A-Za-z0-9._:/@+\-]{1,200}$")


def catalog() -> list[dict]:
    return [{"id": pid, "label": p["label"], "requires_key": p["key"], "requires_base_url": p["base_url"],
             "suggestions": p["suggestions"]} for pid, p in PROVIDERS.items()]


def litellm_model(provider: str, model: str) -> str:
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail="Unknown provider")
    if not MODEL_NAME.match(model):
        raise HTTPException(status_code=400, detail="Invalid model name")
    return f"{PROVIDERS[provider]['prefix']}/{model}"


def validate_base_url(url: str, allow_private: bool) -> str:
    """Reject URLs that could be used to reach the API host's private network (SSRF)."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Base URL must be an absolute http(s) URL")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="Base URL must not contain credentials")
    if allow_private:
        return url.strip().rstrip("/")
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Base URL must use https")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Base URL host cannot be resolved")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise HTTPException(status_code=400, detail="Base URL must point to a public address")
    return url.strip().rstrip("/")
