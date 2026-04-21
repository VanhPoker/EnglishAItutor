"""JWT authentication utilities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Callable
from uuid import uuid4

import bcrypt
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select, update

from app.core.settings import settings
from app.database.connection import get_session_factory
from app.database.models import RefreshToken, User

security = HTTPBearer(auto_error=False)


def _utc_now_aware() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_naive() -> datetime:
    return datetime.utcnow()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def validate_password_strength(password: str, *, email: str | None = None, name: str | None = None) -> None:
    errors: list[str] = []

    if len(password) < 8:
        errors.append("Password must be at least 8 characters long.")
    if password.lower() == password or password.upper() == password:
        errors.append("Password must include both uppercase and lowercase letters.")
    if not any(ch.isdigit() for ch in password):
        errors.append("Password must include at least one number.")
    if not any(not ch.isalnum() for ch in password):
        errors.append("Password must include at least one special character.")

    lowered = password.lower()
    for candidate in (email or "", name or ""):
        cleaned = candidate.strip().lower()
        if cleaned and cleaned in lowered:
            errors.append("Password must not contain your email or name.")
            break

    if errors:
        raise HTTPException(status_code=400, detail=" ".join(errors))


def create_access_token(user: User) -> str:
    issued_at = _utc_now_aware()
    expire = issued_at + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": user.id,
        "role": user.role,
        "type": "access",
        "exp": expire,
        "iat": issued_at,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    issued_at = _utc_now_aware()
    expires_at = issued_at + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    jti = uuid4().hex
    payload = {
        "sub": user_id,
        "jti": jti,
        "type": "refresh",
        "exp": expires_at,
        "iat": issued_at,
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti, expires_at.replace(tzinfo=None)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


async def persist_refresh_token(user_id: str, jti: str, expires_at: datetime) -> None:
    factory = get_session_factory()
    async with factory() as session:
        session.add(RefreshToken(user_id=user_id, jti=jti, expires_at=expires_at))
        await session.commit()


async def revoke_refresh_token(jti: str) -> None:
    factory = get_session_factory()
    async with factory() as session:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.jti == jti, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=_utc_now_naive())
        )
        await session.commit()


async def revoke_all_refresh_tokens(user_id: str) -> None:
    factory = get_session_factory()
    async with factory() as session:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=_utc_now_naive())
        )
        await session.commit()


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/api/auth",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path="/api/auth",
    )


async def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    token_type = payload.get("type")

    if not user_id or token_type != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return user


async def get_refresh_session(request: Request) -> tuple[RefreshToken, User]:
    refresh_token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")

    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = payload.get("sub")
    jti = payload.get("jti")
    if not user_id or not jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    factory = get_session_factory()
    async with factory() as session:
        token_result = await session.execute(select(RefreshToken).where(RefreshToken.jti == jti))
        token_row = token_result.scalar_one_or_none()
        if token_row is None or token_row.user_id != user_id or token_row.revoked_at is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")
        if token_row.expires_at <= _utc_now_naive():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

        user_result = await session.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        return token_row, user


def require_role(*roles: str) -> Callable[[User], User]:
    async def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return dependency
