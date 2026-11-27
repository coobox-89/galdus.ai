from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from litellm import acompletion
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from .config import settings
from .db import get_db
from .identity import current_user, router as identity_router
from .models import User
from .schemas import ChatRequest, ChatResponse

app = FastAPI(title="Galdus.ai API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()], allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "Authorization"])
app.include_router(identity_router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "galdus-api"}

@app.get("/readyz")
async def readiness(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
    return {"status": "ready", "database": "ok"}

@app.post("/api/v1/chat/completions", response_model=ChatResponse)
async def chat(body: ChatRequest, user: User = Depends(current_user)):
    if not settings.openai_api_key and not (body.model or "").startswith("ollama/"):
        raise HTTPException(status_code=503, detail="Configure a server-side model provider key first.")
    try:
        result = await acompletion(model=body.model or settings.litellm_model, messages=[m.model_dump() for m in body.messages], api_key=settings.openai_api_key or None)
        return ChatResponse(model=result.model, content=result.choices[0].message.content or "")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Model provider request failed: {type(exc).__name__}") from exc
