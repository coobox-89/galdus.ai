from pydantic import BaseModel, Field

class Message(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str

class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[Message] = Field(min_length=1)

class ChatResponse(BaseModel):
    model: str
    content: str
