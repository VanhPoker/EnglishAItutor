"""Billing and QR payment requests."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select

from app.core.auth import get_current_user, require_role
from app.core.subscriptions import PLANS, normalize_plan, usage_today
from app.database.connection import get_session_factory
from app.database.models import PaymentRequest, User

router = APIRouter(tags=["Billing"])

PlanCode = Literal["free", "plus", "ultra"]
PaymentStatus = Literal["pending", "approved", "rejected"]


class PlanResponse(BaseModel):
    code: PlanCode
    name: str
    price_vnd: int
    chat_limit: int | None
    quiz_limit: int | None
    description: str


class BillingStatusResponse(BaseModel):
    subscription_plan: PlanCode
    plan_name: str
    chat_limit: int | None
    quiz_limit: int | None
    chat_used_today: int
    quiz_used_today: int


class PaymentRequestCreate(BaseModel):
    plan: Literal["plus", "ultra"]


class PaymentRequestUpdate(BaseModel):
    status: PaymentStatus
    admin_note: str | None = Field(default=None, max_length=500)


class PaymentRequestResponse(BaseModel):
    id: str
    user_id: str
    user_email: str | None = None
    user_name: str | None = None
    plan: PlanCode
    amount_vnd: int
    status: PaymentStatus
    qr_payload: str
    admin_note: str | None
    created_at: datetime
    updated_at: datetime


def _plan_response(plan_code: str) -> PlanResponse:
    plan = normalize_plan(plan_code)
    return PlanResponse(
        code=plan.code,
        name=plan.name,
        price_vnd=plan.price_vnd,
        chat_limit=plan.chat_limit,
        quiz_limit=plan.quiz_limit,
        description=plan.description,
    )


def _payment_response(payment: PaymentRequest, user: User | None = None) -> PaymentRequestResponse:
    return PaymentRequestResponse(
        id=payment.id,
        user_id=payment.user_id,
        user_email=user.email if user else None,
        user_name=user.name if user else None,
        plan=normalize_plan(payment.plan).code,
        amount_vnd=payment.amount_vnd,
        status=payment.status,
        qr_payload=payment.qr_payload,
        admin_note=payment.admin_note,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
    )


def _qr_payload(user: User, plan_code: str, amount: int) -> str:
    return (
        "ENGLISH_AI_TUTOR_QR\n"
        "Bank: DEMO BANK\n"
        "Account: 0123456789\n"
        "Name: ENGLISH AI TUTOR\n"
        f"Amount: {amount}\n"
        f"User: {user.email}\n"
        f"Plan: {plan_code.upper()}\n"
        "Content: EAT "
        f"{user.email} {plan_code.upper()}"
    )


@router.get("/billing/plans", response_model=list[PlanResponse])
async def list_plans():
    return [_plan_response(code) for code in PLANS]


@router.get("/billing/me", response_model=BillingStatusResponse)
async def billing_status(user: User = Depends(get_current_user)):
    plan = normalize_plan(user.subscription_plan)
    usage = await usage_today(user.id)
    return BillingStatusResponse(
        subscription_plan=plan.code,
        plan_name=plan.name,
        chat_limit=plan.chat_limit,
        quiz_limit=plan.quiz_limit,
        chat_used_today=usage["chat"],
        quiz_used_today=usage["quiz"],
    )


@router.get("/billing/payment-requests", response_model=list[PaymentRequestResponse])
async def my_payment_requests(user: User = Depends(get_current_user)):
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(PaymentRequest)
            .where(PaymentRequest.user_id == user.id)
            .order_by(desc(PaymentRequest.created_at))
            .limit(20)
        )
        return [_payment_response(item) for item in result.scalars().all()]


@router.post("/billing/payment-requests", response_model=PaymentRequestResponse)
async def create_payment_request(req: PaymentRequestCreate, user: User = Depends(require_role("learner"))):
    plan = normalize_plan(req.plan)
    factory = get_session_factory()
    async with factory() as session:
        payment = PaymentRequest(
            user_id=user.id,
            plan=plan.code,
            amount_vnd=plan.price_vnd,
            status="pending",
            qr_payload=_qr_payload(user, plan.code, plan.price_vnd),
        )
        session.add(payment)
        await session.commit()
        await session.refresh(payment)
        return _payment_response(payment)


@router.get("/admin/payments", response_model=list[PaymentRequestResponse])
async def admin_payment_requests(current_admin: User = Depends(require_role("admin"))):
    del current_admin
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(PaymentRequest, User)
            .join(User, User.id == PaymentRequest.user_id)
            .order_by(desc(PaymentRequest.created_at))
            .limit(100)
        )
        return [_payment_response(payment, user) for payment, user in result.all()]


@router.patch("/admin/payments/{payment_id}", response_model=PaymentRequestResponse)
async def update_payment_request(
    payment_id: str,
    req: PaymentRequestUpdate,
    current_admin: User = Depends(require_role("admin")),
):
    del current_admin
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(PaymentRequest, User)
            .join(User, User.id == PaymentRequest.user_id)
            .where(PaymentRequest.id == payment_id)
        )
        row = result.one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Payment request not found")

        payment, user = row
        payment.status = req.status
        payment.admin_note = req.admin_note
        if req.status == "approved":
            user.subscription_plan = normalize_plan(payment.plan).code
        await session.commit()
        await session.refresh(payment)
        await session.refresh(user)
        return _payment_response(payment, user)
