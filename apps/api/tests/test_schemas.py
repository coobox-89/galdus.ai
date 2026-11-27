import pytest
from pydantic import ValidationError

from app.schemas import ChatRequest, Message


def test_chat_request_accepts_valid_messages():
    request = ChatRequest(messages=[Message(role="user", content="Hello")])
    assert request.messages[0].content == "Hello"


def test_chat_request_requires_at_least_one_message():
    with pytest.raises(ValidationError):
        ChatRequest(messages=[])


def test_message_rejects_unknown_role():
    with pytest.raises(ValidationError):
        Message(role="tool", content="not allowed")
