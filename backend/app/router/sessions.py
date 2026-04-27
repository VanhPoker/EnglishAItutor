"""Sessions & Dashboard router — session history, stats, progress."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select

from app.core.auth import require_role
from app.database.connection import get_session_factory
from app.database.models import ErrorLog, PracticeSession, User

router = APIRouter(tags=["Sessions"])


def _utc_now_naive() -> datetime:
    return datetime.utcnow()


# ── Schemas ──────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    room_name: str
    topic: str = "free_conversation"
    level: str = "B1"


class SessionUpdate(BaseModel):
    total_turns: int = 0
    total_errors: int = 0
    corrections_given: int = 0
    duration_minutes: float = 0.0
    grammar_score: Optional[int] = None
    vocabulary_score: Optional[int] = None
    fluency_score: Optional[int] = None
    stats_json: Optional[dict] = None


class SessionResponse(BaseModel):
    id: str
    room_name: str
    topic: str
    level: str
    total_turns: int
    total_errors: int
    corrections_given: int
    duration_minutes: float
    grammar_score: Optional[int]
    vocabulary_score: Optional[int]
    fluency_score: Optional[int]
    started_at: datetime
    ended_at: Optional[datetime]


class DashboardStats(BaseModel):
    total_sessions: int
    total_minutes: float
    total_turns: int
    total_errors: int
    avg_grammar: Optional[float]
    avg_vocabulary: Optional[float]
    avg_fluency: Optional[float]
    streak_days: int
    common_errors: list[dict]
    recent_sessions: list[SessionResponse]


class ReviewError(BaseModel):
    error_type: str
    original: str
    correction: str
    explanation: Optional[str] = None
    count: int = 1


class ReviewDrill(BaseModel):
    id: str
    error_type: str
    instruction: str
    prompt: str
    target: str
    hint: Optional[str] = None


class SessionReviewResponse(BaseModel):
    session: SessionResponse
    stats_json: Optional[dict] = None
    top_errors: list[ReviewError]
    drills: list[ReviewDrill]


class ErrorCreate(BaseModel):
    session_id: str
    error_type: str
    original_text: str
    corrected_text: str
    explanation: Optional[str] = None


# ── Session endpoints ────────────────────────────────────────────

@router.post("/sessions", response_model=SessionResponse)
async def create_session(req: SessionCreate, user: User = Depends(require_role("learner"))):
    factory = get_session_factory()
    async with factory() as db:
        session = PracticeSession(
            user_id=user.id,
            room_name=req.room_name,
            topic=req.topic,
            level=req.level,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return _session_response(session)


@router.put("/sessions/{session_id}", response_model=SessionResponse)
async def end_session(session_id: str, req: SessionUpdate, user: User = Depends(require_role("learner"))):
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(PracticeSession).where(
                PracticeSession.id == session_id,
                PracticeSession.user_id == user.id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Session not found")

        for key, value in req.model_dump(exclude_none=True).items():
            setattr(session, key, value)
        session.ended_at = _utc_now_naive()

        await db.commit()
        await db.refresh(session)
        return _session_response(session)


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_role("learner")),
):
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(PracticeSession)
            .where(PracticeSession.user_id == user.id)
            .order_by(desc(PracticeSession.started_at))
            .limit(limit)
            .offset(offset)
        )
        sessions = result.scalars().all()
        return [_session_response(s) for s in sessions]


@router.get("/sessions/latest-review", response_model=SessionReviewResponse)
async def get_latest_session_review(user: User = Depends(require_role("learner"))):
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(PracticeSession)
            .where(
                PracticeSession.user_id == user.id,
                PracticeSession.ended_at.is_not(None),
            )
            .order_by(desc(PracticeSession.ended_at), desc(PracticeSession.started_at))
            .limit(1)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="No completed practice session yet")

        return await _build_session_review(db, session)


@router.get("/sessions/{session_id}/review", response_model=SessionReviewResponse)
async def get_session_review(session_id: str, user: User = Depends(require_role("learner"))):
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(PracticeSession).where(
                PracticeSession.id == session_id,
                PracticeSession.user_id == user.id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        return await _build_session_review(db, session)


# ── Error logging ────────────────────────────────────────────────

@router.post("/errors")
async def log_error(req: ErrorCreate, user: User = Depends(require_role("learner"))):
    factory = get_session_factory()
    async with factory() as db:
        error = ErrorLog(
            session_id=req.session_id,
            user_id=user.id,
            error_type=req.error_type,
            original_text=req.original_text,
            corrected_text=req.corrected_text,
            explanation=req.explanation,
        )
        db.add(error)
        await db.commit()
        return {"status": "ok"}


# ── Dashboard ────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard(user: User = Depends(require_role("learner"))):
    factory = get_session_factory()
    async with factory() as db:
        # Aggregate stats
        stats_result = await db.execute(
            select(
                func.count(PracticeSession.id).label("total_sessions"),
                func.coalesce(func.sum(PracticeSession.duration_minutes), 0).label("total_minutes"),
                func.coalesce(func.sum(PracticeSession.total_turns), 0).label("total_turns"),
                func.coalesce(func.sum(PracticeSession.total_errors), 0).label("total_errors"),
                func.avg(PracticeSession.grammar_score).label("avg_grammar"),
                func.avg(PracticeSession.vocabulary_score).label("avg_vocabulary"),
                func.avg(PracticeSession.fluency_score).label("avg_fluency"),
            ).where(PracticeSession.user_id == user.id)
        )
        row = stats_result.one()

        # Streak: count consecutive days with sessions
        dates_result = await db.execute(
            select(func.date(PracticeSession.started_at).distinct())
            .where(PracticeSession.user_id == user.id)
            .order_by(func.date(PracticeSession.started_at).desc())
        )
        dates = [d[0] for d in dates_result.all()]
        streak = _calc_streak(dates)

        # Common errors (top 5 error types)
        errors_result = await db.execute(
            select(ErrorLog.error_type, func.count(ErrorLog.id).label("count"))
            .where(ErrorLog.user_id == user.id)
            .group_by(ErrorLog.error_type)
            .order_by(desc("count"))
            .limit(5)
        )
        common_errors = [{"type": r.error_type, "count": r.count} for r in errors_result.all()]

        # Recent sessions
        recent_result = await db.execute(
            select(PracticeSession)
            .where(PracticeSession.user_id == user.id)
            .order_by(desc(PracticeSession.started_at))
            .limit(5)
        )
        recent = [_session_response(s) for s in recent_result.scalars().all()]

        return DashboardStats(
            total_sessions=row.total_sessions,
            total_minutes=float(row.total_minutes),
            total_turns=int(row.total_turns),
            total_errors=int(row.total_errors),
            avg_grammar=round(float(row.avg_grammar), 1) if row.avg_grammar else None,
            avg_vocabulary=round(float(row.avg_vocabulary), 1) if row.avg_vocabulary else None,
            avg_fluency=round(float(row.avg_fluency), 1) if row.avg_fluency else None,
            streak_days=streak,
            common_errors=common_errors,
            recent_sessions=recent,
        )


# ── Helpers ──────────────────────────────────────────────────────

def _session_response(s: PracticeSession) -> SessionResponse:
    return SessionResponse(
        id=s.id,
        room_name=s.room_name,
        topic=s.topic,
        level=s.level,
        total_turns=s.total_turns,
        total_errors=s.total_errors,
        corrections_given=s.corrections_given,
        duration_minutes=s.duration_minutes,
        grammar_score=s.grammar_score,
        vocabulary_score=s.vocabulary_score,
        fluency_score=s.fluency_score,
        started_at=s.started_at,
        ended_at=s.ended_at,
    )


async def _build_session_review(db, session: PracticeSession) -> SessionReviewResponse:
    count_label = func.count(ErrorLog.id).label("count")
    errors_result = await db.execute(
        select(
            ErrorLog.error_type,
            ErrorLog.original_text,
            ErrorLog.corrected_text,
            ErrorLog.explanation,
            count_label,
        )
        .where(ErrorLog.session_id == session.id)
        .group_by(
            ErrorLog.error_type,
            ErrorLog.original_text,
            ErrorLog.corrected_text,
            ErrorLog.explanation,
        )
        .order_by(count_label.desc(), ErrorLog.error_type.asc())
        .limit(5)
    )

    top_errors = [
        ReviewError(
            error_type=row.error_type or "grammar",
            original=row.original_text or "",
            correction=row.corrected_text or "",
            explanation=row.explanation,
            count=int(row.count or 1),
        )
        for row in errors_result.all()
    ]

    if not top_errors:
        for item in (session.stats_json or {}).get("top_error_patterns", [])[:5]:
            top_errors.append(
                ReviewError(
                    error_type=item.get("error_type") or "grammar",
                    original=item.get("original") or "",
                    correction=item.get("correction") or "",
                    explanation=item.get("explanation"),
                    count=int(item.get("count") or 1),
                )
            )

    drills = [
        ReviewDrill(
            id=f"{session.id}:{idx}",
            error_type=item.error_type,
            instruction="Rewrite the sentence with the corrected form.",
            prompt=item.original,
            target=item.correction,
            hint=item.explanation,
        )
        for idx, item in enumerate(top_errors[:3], start=1)
        if item.original and item.correction
    ]

    return SessionReviewResponse(
        session=_session_response(session),
        stats_json=session.stats_json,
        top_errors=top_errors,
        drills=drills,
    )


def _calc_streak(dates: list) -> int:
    if not dates:
        return 0
    from datetime import date, timedelta
    today = date.today()
    streak = 0
    for d in dates:
        expected = today - timedelta(days=streak)
        if d == expected:
            streak += 1
        else:
            break
    return streak
