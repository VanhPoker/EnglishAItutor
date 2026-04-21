"""Repository helpers for agent to persist sessions and errors directly."""

from datetime import datetime
from typing import Optional

from loguru import logger
from sqlalchemy import select

from app.database.connection import get_session_factory
from app.database.models import ErrorLog, PracticeSession, User


def _utc_now_naive() -> datetime:
    return datetime.utcnow()


async def create_practice_session(
    user_id: str,
    room_name: str,
    topic: str,
    level: str,
) -> Optional[str]:
    """Create a new practice session row, return its id."""
    try:
        factory = get_session_factory()
        async with factory() as db:
            session = PracticeSession(
                user_id=user_id,
                room_name=room_name,
                topic=topic,
                level=level,
            )
            db.add(session)
            await db.commit()
            await db.refresh(session)
            logger.info(f"Created practice session {session.id} for user {user_id}")
            return session.id
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
        return None


async def end_practice_session(
    session_id: str,
    total_turns: int = 0,
    total_errors: int = 0,
    corrections_given: int = 0,
    duration_minutes: float = 0.0,
    grammar_score: Optional[int] = None,
    vocabulary_score: Optional[int] = None,
    fluency_score: Optional[int] = None,
    stats_json: Optional[dict] = None,
) -> None:
    """Update a practice session with final stats."""
    try:
        factory = get_session_factory()
        async with factory() as db:
            result = await db.execute(
                select(PracticeSession).where(PracticeSession.id == session_id)
            )
            session = result.scalar_one_or_none()
            if not session:
                logger.warning(f"Session {session_id} not found for ending")
                return

            session.total_turns = total_turns
            session.total_errors = total_errors
            session.corrections_given = corrections_given
            session.duration_minutes = duration_minutes
            session.grammar_score = grammar_score
            session.vocabulary_score = vocabulary_score
            session.fluency_score = fluency_score
            session.stats_json = stats_json
            session.ended_at = _utc_now_naive()

            await db.commit()
            logger.info(f"Ended session {session_id}: turns={total_turns}, errors={total_errors}")
    except Exception as e:
        logger.error(f"Failed to end session: {e}")


async def log_error(
    session_id: str,
    user_id: str,
    error_type: str,
    original_text: str,
    corrected_text: str,
    explanation: Optional[str] = None,
) -> None:
    """Log a grammar/vocab error to the error_logs table."""
    try:
        factory = get_session_factory()
        async with factory() as db:
            error = ErrorLog(
                session_id=session_id,
                user_id=user_id,
                error_type=error_type,
                original_text=original_text,
                corrected_text=corrected_text,
                explanation=explanation,
            )
            db.add(error)
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log error: {e}")


async def update_user_cefr_level(user_id: str, cefr_level: str) -> None:
    """Persist a more evidence-based CEFR level for future sessions."""
    try:
        factory = get_session_factory()
        async with factory() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                logger.warning(f"User {user_id} not found for CEFR update")
                return
            if user.cefr_level == cefr_level:
                return

            user.cefr_level = cefr_level
            await db.commit()
            logger.info(f"Updated user {user_id} CEFR level to {cefr_level}")
    except Exception as e:
        logger.error(f"Failed to update user CEFR level: {e}")
