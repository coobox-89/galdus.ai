"""First-run guided tour. The state lives on the account, so it follows the person across browsers and devices."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .identity import current_user
from .models import User

router = APIRouter(prefix="/api/v1/auth/onboarding", tags=["onboarding"])


class OnboardingIn(BaseModel):
    # completed: reached the last step. skipped: closed it early. pending: show it again ("Replay the tour").
    status: str = Field(pattern="^(completed|skipped|pending)$")


def state(user: User) -> dict:
    return {"status": user.onboarding_status or "pending",
            "completed_at": user.onboarding_completed_at.isoformat() if user.onboarding_completed_at else None}


@router.get("")
async def get_onboarding(user: User = Depends(current_user)):
    return state(user)


@router.put("")
async def set_onboarding(body: OnboardingIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.status == "pending":
        user.onboarding_status, user.onboarding_completed_at = None, None
    else:
        user.onboarding_status, user.onboarding_completed_at = body.status, datetime.now(timezone.utc)
    await db.commit()
    return state(user)
