"""Subscription plans and daily quota helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import func, select

from app.database.connection import get_session_factory
from app.database.models import PracticeSession, QuizAttempt, User

PlanCode = Literal["free", "plus", "ultra"]
UsageKind = Literal["chat", "quiz"]


@dataclass(frozen=True)
class Plan:
    code: PlanCode
    name: str
    price_vnd: int
    chat_limit: int | None
    quiz_limit: int | None
    description: str


PLANS: dict[str, Plan] = {
    "free": Plan(
        code="free",
        name="Free",
        price_vnd=0,
        chat_limit=5,
        quiz_limit=10,
        description="5 lượt chat mỗi ngày và 10 lượt làm quiz mỗi ngày.",
    ),
    "plus": Plan(
        code="plus",
        name="Plus",
        price_vnd=99_000,
        chat_limit=25,
        quiz_limit=None,
        description="25 lượt chat mỗi ngày và không giới hạn làm quiz.",
    ),
    "ultra": Plan(
        code="ultra",
        name="Ultra",
        price_vnd=199_000,
        chat_limit=None,
        quiz_limit=None,
        description="Không giới hạn toàn bộ.",
    ),
}


def normalize_plan(plan: str | None) -> Plan:
    return PLANS.get((plan or "free").strip().lower(), PLANS["free"])


def today_start() -> datetime:
    now = datetime.utcnow()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


async def usage_today(user_id: str) -> dict[str, int]:
    start = today_start()
    factory = get_session_factory()
    async with factory() as session:
        chat_count = int(
            (
                await session.execute(
                    select(func.count(PracticeSession.id)).where(
                        PracticeSession.user_id == user_id,
                        PracticeSession.started_at >= start,
                    )
                )
            ).scalar_one()
        )
        quiz_count = int(
            (
                await session.execute(
                    select(func.count(QuizAttempt.id)).where(
                        QuizAttempt.user_id == user_id,
                        QuizAttempt.created_at >= start,
                    )
                )
            ).scalar_one()
        )
    return {"chat": chat_count, "quiz": quiz_count}


async def assert_quota_available(user: User, kind: UsageKind) -> None:
    plan = normalize_plan(user.subscription_plan)
    limit = plan.chat_limit if kind == "chat" else plan.quiz_limit
    if limit is None:
        return

    usage = await usage_today(user.id)
    used = usage[kind]
    if used >= limit:
        label = "chat với gia sư AI" if kind == "chat" else "làm quiz"
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Gói {plan.name} đã hết {label} hôm nay ({used}/{limit}). Hãy nâng cấp gói để tiếp tục.",
        )
