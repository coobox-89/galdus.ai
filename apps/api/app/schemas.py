# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

import uuid

from pydantic import BaseModel, Field, field_validator

MAX_TOTAL_CHARS = 200_000


class Message(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(max_length=100000)


class ChatRequest(BaseModel):
    connection_id: uuid.UUID | None = None
    model: str | None = Field(default=None, max_length=200)
    messages: list[Message] = Field(min_length=1, max_length=100)

    @field_validator("messages")
    @classmethod
    def bound_total_size(cls, messages: list[Message]) -> list[Message]:
        if sum(len(m.content) for m in messages) > MAX_TOTAL_CHARS:
            raise ValueError(f"Conversation exceeds {MAX_TOTAL_CHARS} characters")
        return messages


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0


class ChatResponse(BaseModel):
    model: str
    content: str
    usage: Usage = Usage()


class ModelsResponse(BaseModel):
    default: str
    models: list[str]
