"""Auth router — register, login, refresh, logout, me."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select

from app.core.auth import (
    clear_refresh_cookie,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_refresh_session,
    hash_password,
    persist_refresh_token,
    revoke_refresh_token,
    set_refresh_cookie,
    validate_password_strength,
    verify_password,
)
from app.core.rate_limit import auth_rate_limiter
from app.core.settings import settings
from app.database.connection import get_session_factory
from app.database.models import User

router = APIRouter(tags=["Auth"])

CEFRLevel = Literal["A1", "A2", "B1", "B2", "C1", "C2"]
UserRole = Literal["learner", "admin"]


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


async def _enforce_limit(key: str, *, limit: int, window_seconds: int, message: str) -> None:
    retry_after = await auth_rate_limiter.hit(key, limit, window_seconds)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"{message} Try again in {retry_after} seconds.",
        )


async def _apply_login_limits(request: Request, email: str) -> None:
    ip = _client_ip(request)
    normalized = _normalize_email(email)
    await _enforce_limit(f"login:ip:{ip}", limit=20, window_seconds=300, message="Too many login attempts.")
    await _enforce_limit(f"login:email:{normalized}", limit=8, window_seconds=300, message="Too many login attempts.")


async def _apply_register_limits(request: Request, email: str) -> None:
    ip = _client_ip(request)
    normalized = _normalize_email(email)
    await _enforce_limit(f"register:ip:{ip}", limit=10, window_seconds=600, message="Too many sign-up attempts.")
    await _enforce_limit(f"register:email:{normalized}", limit=3, window_seconds=600, message="Too many sign-up attempts.")


async def _apply_refresh_limits(request: Request) -> None:
    ip = _client_ip(request)
    await _enforce_limit(f"refresh:ip:{ip}", limit=30, window_seconds=300, message="Too many refresh attempts.")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=80)
    native_language: str = Field(default="vi", min_length=2, max_length=16)
    cefr_level: CEFRLevel = "B1"

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return _normalize_email(str(value))

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 characters.")
        return cleaned

    @field_validator("native_language")
    @classmethod
    def normalize_language(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not cleaned.replace("-", "").isalpha():
            raise ValueError("Native language must use letters only.")
        return cleaned


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return _normalize_email(str(value))


class AuthUser(BaseModel):
    id: str
    email: str
    name: str
    native_language: str
    cefr_level: CEFRLevel
    role: UserRole
    subscription_plan: Literal["free", "plus", "ultra"] = "free"


class AuthResponse(BaseModel):
    token: str
    expires_in: int
    user: AuthUser


class UserResponse(AuthUser):
    pass


class ProfileUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    native_language: str | None = Field(default=None, min_length=2, max_length=16)
    cefr_level: CEFRLevel | None = None

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


def _user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "native_language": user.native_language,
        "cefr_level": user.cefr_level,
        "role": user.role,
        "subscription_plan": user.subscription_plan or "free",
    }


async def _issue_auth_response(response: Response, user: User) -> AuthResponse:
    access_token = create_access_token(user)
    refresh_token, jti, expires_at = create_refresh_token(user.id)
    await persist_refresh_token(user.id, jti, expires_at)
    set_refresh_cookie(response, refresh_token)
    return AuthResponse(
        token=access_token,
        expires_in=settings.JWT_EXPIRE_MINUTES * 60,
        user=AuthUser(**_user_dict(user)),
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, request: Request, response: Response):
    await _apply_register_limits(request, req.email)
    validate_password_strength(req.password, email=req.email, name=req.name)

    factory = get_session_factory()
    async with factory() as session:
        existing = await session.execute(select(User).where(User.email == req.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")

        user = User(
            email=req.email,
            password_hash=hash_password(req.password),
            name=req.name,
            native_language=req.native_language,
            cefr_level=req.cefr_level,
            role="learner",
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    return await _issue_auth_response(response, user)


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, request: Request, response: Response):
    await _apply_login_limits(request, req.email)

    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(select(User).where(User.email == req.email))
        user = result.scalar_one_or_none()
        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

    return await _issue_auth_response(response, user)


@router.post("/refresh", response_model=AuthResponse)
async def refresh_session(request: Request, response: Response):
    await _apply_refresh_limits(request)
    current_token, user = await get_refresh_session(request)
    await revoke_refresh_token(current_token.jti)
    return await _issue_auth_response(response, user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    try:
        current_token, _ = await get_refresh_session(request)
        await revoke_refresh_token(current_token.jti)
    except HTTPException:
        pass

    clear_refresh_cookie(response)
    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse(**_user_dict(user))


@router.put("/me", response_model=UserResponse)
async def update_me(updates: ProfileUpdateRequest, user: User = Depends(get_current_user)):
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(select(User).where(User.id == user.id))
        db_user = result.scalar_one()
        for key, value in updates.model_dump(exclude_none=True).items():
            setattr(db_user, key, value)
        await session.commit()
        await session.refresh(db_user)
        return UserResponse(**_user_dict(db_user))
