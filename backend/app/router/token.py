import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from livekit import api
from livekit.api import RoomAgentDispatch, RoomConfiguration
from pydantic import BaseModel

from app.core.auth import require_role
from app.core.settings import settings
from app.core.subscriptions import assert_quota_available
from app.database.models import User

logger = logging.getLogger(__name__)


class TokenRequest(BaseModel):
    topic: Optional[str] = None
    level: Optional[str] = None  # CEFR level: A1-C2


class TokenResponse(BaseModel):
    token: str
    roomName: str


router = APIRouter(tags=["Token"])


def create_token(user_id: str, user_name: str, topic: str | None, level: str | None) -> dict:
    """Create a LiveKit access token for an English practice session."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    room_name = f"english-practice-{user_id}_{timestamp}"

    metadata = {
        "user_id": user_id,
        "user_name": user_name,
        "topic": topic or "free_conversation",
        "level": level or "B1",
    }

    room_metadata = {
        "agent_name": "English Tutor",
        "user_id": user_id,
        "topic": topic or "free_conversation",
        "level": level or "B1",
    }

    token = (
        api.AccessToken(
            settings.LIVEKIT_API_KEY.get_secret_value(),
            settings.LIVEKIT_API_SECRET.get_secret_value(),
        )
        .with_identity(user_id)
        .with_name(user_name)
        .with_ttl(timedelta(minutes=30))
        .with_metadata(json.dumps(metadata))
        .with_attributes(metadata)
        .with_grants(api.VideoGrants(room_join=True, room=room_name))
        .with_room_config(
            RoomConfiguration(
                agents=[RoomAgentDispatch(metadata=json.dumps(room_metadata))],
            ),
        )
    )

    jwt_token = token.to_jwt()
    logger.info(f"Token created for user={user_id}, room={room_name}, topic={topic}, level={level}")

    return {"token": jwt_token, "roomName": room_name}


@router.post("/token", response_model=TokenResponse)
async def get_token(request: TokenRequest, user: User = Depends(require_role("learner"))):
    try:
        await assert_quota_available(user, "chat")
        result = create_token(
            user_id=user.id,
            user_name=user.name,
            topic=request.topic,
            level=request.level or user.cefr_level,
        )
        return TokenResponse(**result)
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Error creating token: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/token")
async def get_token_default(user: User = Depends(require_role("learner"))):
    """Quick token for development/testing."""
    try:
        await assert_quota_available(user, "chat")
        result = create_token(user.id, user.name, "free_conversation", user.cefr_level)
        return result
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Error creating token: {error}")
        raise HTTPException(status_code=500, detail=str(error))
