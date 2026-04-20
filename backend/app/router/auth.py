"""Auth router — register, login, me."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.core.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.database.connection import get_session_factory
from app.database.models import User

router = APIRouter(tags=["Auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    native_language: str = "vi"
    cefr_level: str = "B1"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    native_language: str
    cefr_level: str


def _user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "native_language": user.native_language,
        "cefr_level": user.cefr_level,
    }


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
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
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        token = create_access_token(user.id)
        return AuthResponse(token=token, user=_user_dict(user))


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(select(User).where(User.email == req.email))
        user = result.scalar_one_or_none()
        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = create_access_token(user.id)
        return AuthResponse(token=token, user=_user_dict(user))


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse(**_user_dict(user))


@router.put("/me", response_model=UserResponse)
async def update_me(updates: dict, user: User = Depends(get_current_user)):
    allowed = {"name", "native_language", "cefr_level"}
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(select(User).where(User.id == user.id))
        db_user = result.scalar_one()
        for key, value in updates.items():
            if key in allowed:
                setattr(db_user, key, value)
        await session.commit()
        await session.refresh(db_user)
        return UserResponse(**_user_dict(db_user))
