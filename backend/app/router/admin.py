"""Admin router — manage users."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, func, or_, select

from app.core.auth import get_current_user, require_role
from app.database.connection import get_session_factory
from app.database.models import PracticeSession, User

router = APIRouter(tags=["Admin"])

CEFRLevel = Literal["A1", "A2", "B1", "B2", "C1", "C2"]
UserRole = Literal["learner", "admin"]


class AdminUserResponse(BaseModel):
    id: str
    email: str
    name: str
    native_language: str
    cefr_level: CEFRLevel
    role: UserRole
    created_at: datetime
    updated_at: datetime
    session_count: int
    total_minutes: float
    last_session_at: datetime | None


class AdminUsersListResponse(BaseModel):
    total: int
    users: list[AdminUserResponse]


class AdminIdentityResponse(BaseModel):
    id: str
    email: str
    name: str
    native_language: str
    cefr_level: CEFRLevel
    role: UserRole


class AdminBootstrapStatusResponse(BaseModel):
    admin_exists: bool


class AdminUserUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    native_language: str | None = Field(default=None, min_length=2, max_length=16)
    cefr_level: CEFRLevel | None = None
    role: UserRole | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 characters.")
        return cleaned

    @field_validator("native_language")
    @classmethod
    def normalize_language(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip().lower()
        if not cleaned.replace("-", "").isalpha():
            raise ValueError("Native language must use letters only.")
        return cleaned


def _user_row_to_response(row) -> AdminUserResponse:
    user = getattr(row, "user", None) or getattr(row, "User", None) or row[0]
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        native_language=user.native_language,
        cefr_level=user.cefr_level,
        role=user.role,
        created_at=user.created_at,
        updated_at=user.updated_at,
        session_count=int(row.session_count or 0),
        total_minutes=float(row.total_minutes or 0),
        last_session_at=row.last_session_at,
    )


def _identity_response(user: User) -> AdminIdentityResponse:
    return AdminIdentityResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        native_language=user.native_language,
        cefr_level=user.cefr_level,
        role=user.role,
    )


@router.get("/admin/bootstrap-status", response_model=AdminBootstrapStatusResponse)
async def get_bootstrap_status(current_user: User = Depends(get_current_user)):
    del current_user
    factory = get_session_factory()
    async with factory() as session:
        admin_count = int(
            (
                await session.execute(select(func.count(User.id)).where(User.role == "admin"))
            ).scalar_one()
        )
        return AdminBootstrapStatusResponse(admin_exists=admin_count > 0)


@router.post("/admin/bootstrap", response_model=AdminIdentityResponse)
async def claim_admin(current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        return _identity_response(current_user)

    factory = get_session_factory()
    async with factory() as session:
        admin_count = int(
            (
                await session.execute(select(func.count(User.id)).where(User.role == "admin"))
            ).scalar_one()
        )
        if admin_count > 0:
            raise HTTPException(status_code=403, detail="An admin already exists.")

        result = await session.execute(select(User).where(User.id == current_user.id))
        user = result.scalar_one()
        user.role = "admin"
        await session.commit()
        await session.refresh(user)
        return _identity_response(user)


@router.get("/admin/users", response_model=AdminUsersListResponse)
async def list_users(
    search: str | None = Query(default=None, max_length=120),
    role: UserRole | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_admin: User = Depends(require_role("admin")),
):
    del current_admin
    factory = get_session_factory()
    async with factory() as session:
        stats_subquery = (
            select(
                PracticeSession.user_id.label("user_id"),
                func.count(PracticeSession.id).label("session_count"),
                func.coalesce(func.sum(PracticeSession.duration_minutes), 0).label("total_minutes"),
                func.max(PracticeSession.started_at).label("last_session_at"),
            )
            .group_by(PracticeSession.user_id)
            .subquery()
        )

        filters = []
        if search:
            term = f"%{search.strip()}%"
            filters.append(or_(User.email.ilike(term), User.name.ilike(term)))
        if role:
            filters.append(User.role == role)

        total_query = select(func.count(User.id))
        if filters:
            total_query = total_query.where(*filters)

        total = int((await session.execute(total_query)).scalar_one())

        query = (
            select(
                User,
                stats_subquery.c.session_count,
                stats_subquery.c.total_minutes,
                stats_subquery.c.last_session_at,
            )
            .outerjoin(stats_subquery, stats_subquery.c.user_id == User.id)
            .order_by(desc(User.created_at))
            .limit(limit)
            .offset(offset)
        )
        if filters:
            query = query.where(*filters)

        rows = (await session.execute(query)).all()
        return AdminUsersListResponse(total=total, users=[_user_row_to_response(row) for row in rows])


@router.patch("/admin/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: str,
    updates: AdminUserUpdateRequest,
    current_admin: User = Depends(require_role("admin")),
):
    if updates.role and user_id == current_admin.id and updates.role != current_admin.role:
        raise HTTPException(status_code=400, detail="You cannot change your own admin role.")

    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        if user.role == "admin" and updates.role == "learner":
            admin_count = int(
                (
                    await session.execute(
                        select(func.count(User.id)).where(User.role == "admin")
                    )
                ).scalar_one()
            )
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="At least one admin must remain.")

        for key, value in updates.model_dump(exclude_none=True).items():
            setattr(user, key, value)

        await session.commit()
        await session.refresh(user)

        stats_row = (
            await session.execute(
                select(
                    func.count(PracticeSession.id).label("session_count"),
                    func.coalesce(func.sum(PracticeSession.duration_minutes), 0).label("total_minutes"),
                    func.max(PracticeSession.started_at).label("last_session_at"),
                ).where(PracticeSession.user_id == user.id)
            )
        ).one()

        class Row:
            pass

        row = Row()
        row.user = user
        row.session_count = stats_row.session_count
        row.total_minutes = stats_row.total_minutes
        row.last_session_at = stats_row.last_session_at
        return _user_row_to_response(row)
