"""Quiz router - create quizzes, submit answers, and review weak areas."""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, select

from app.core.auth import get_current_user
from app.core.llm import get_model
from app.core.settings import settings
from app.database.connection import get_session_factory
from app.database.models import ErrorLog, Quiz, QuizAttempt, User

router = APIRouter(prefix="/quizzes", tags=["Quizzes"])

QuestionType = Literal["multiple_choice", "fill_blank"]
QuizSource = Literal["ai", "manual", "mistakes"]


class QuizQuestion(BaseModel):
    id: str
    type: QuestionType = "multiple_choice"
    prompt: str
    options: list[str] = Field(default_factory=list)
    correct_answer: str
    explanation: str = ""
    focus: str = "grammar"

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        return cleaned[:6]


class QuizQuestionPublic(BaseModel):
    id: str
    type: QuestionType
    prompt: str
    options: list[str] = Field(default_factory=list)
    explanation: str = ""
    focus: str = "grammar"


class QuizCreateRequest(BaseModel):
    title: str = "English practice quiz"
    topic: str = "free_conversation"
    level: str = "B1"
    source: QuizSource = "manual"
    description: Optional[str] = None
    questions: list[QuizQuestion] = Field(default_factory=list)


class QuizGenerateRequest(BaseModel):
    title: Optional[str] = None
    topic: str = "free_conversation"
    level: str = "B1"
    question_count: int = Field(default=5, ge=3, le=10)
    source: Literal["topic", "mistakes"] = "mistakes"
    focus: Optional[str] = None


class QuizAnswerSubmit(BaseModel):
    answers: dict[str, str]


class QuizResponse(BaseModel):
    id: str
    title: str
    topic: str
    level: str
    source: str
    description: Optional[str]
    question_count: int
    questions: list[QuizQuestionPublic]
    created_at: datetime


class QuizListItem(BaseModel):
    id: str
    title: str
    topic: str
    level: str
    source: str
    question_count: int
    created_at: datetime
    latest_score: Optional[int] = None


class QuestionResult(BaseModel):
    question_id: str
    prompt: str
    focus: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    explanation: str = ""


class QuizReview(BaseModel):
    summary: str
    strengths: list[str] = Field(default_factory=list)
    improvement_areas: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


class GeneratedQuizQuestion(BaseModel):
    id: Optional[str] = None
    type: QuestionType = "multiple_choice"
    prompt: str
    options: list[str] = Field(default_factory=list)
    correct_answer: str
    explanation: str = ""
    focus: str = "grammar"


class QuizAttemptResponse(BaseModel):
    id: str
    quiz_id: str
    quiz_title: str
    score: int
    correct_count: int
    total_questions: int
    results: list[QuestionResult]
    ai_review: QuizReview
    created_at: datetime


class GeneratedQuiz(BaseModel):
    title: str
    description: str
    questions: list[GeneratedQuizQuestion]


def _normalize_answer(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower()).strip(" .!?;:,")


def _public_question(question: dict) -> QuizQuestionPublic:
    data = QuizQuestion.model_validate(question)
    return QuizQuestionPublic(
        id=data.id,
        type=data.type,
        prompt=data.prompt,
        options=data.options,
        explanation=data.explanation,
        focus=data.focus,
    )


def _quiz_response(quiz: Quiz) -> QuizResponse:
    questions = [_public_question(item) for item in quiz.questions_json or []]
    return QuizResponse(
        id=quiz.id,
        title=quiz.title,
        topic=quiz.topic,
        level=quiz.level,
        source=quiz.source,
        description=quiz.description,
        question_count=len(questions),
        questions=questions,
        created_at=quiz.created_at,
    )


def _fallback_questions(topic: str, level: str, count: int, focus_text: str) -> list[QuizQuestion]:
    topic_display = topic.replace("_", " ")
    base = [
        QuizQuestion(
            id="q1",
            type="multiple_choice",
            prompt=f"Choose the best sentence for a {level} conversation about {topic_display}.",
            options=[
                "I went there yesterday.",
                "I goed there yesterday.",
                "I go there yesterday.",
                "I going there yesterday.",
            ],
            correct_answer="I went there yesterday.",
            explanation="'Went' is the irregular past form of 'go'.",
            focus="grammar",
        ),
        QuizQuestion(
            id="q2",
            type="multiple_choice",
            prompt="Choose the most natural sentence.",
            options=[
                "I agree with you.",
                "I am agree with you.",
                "I very agree with you.",
                "I do agree you.",
            ],
            correct_answer="I agree with you.",
            explanation="Use 'I agree' without 'am'.",
            focus="grammar",
        ),
        QuizQuestion(
            id="q3",
            type="fill_blank",
            prompt="Complete the sentence: I have been studying English ___ two years.",
            options=[],
            correct_answer="for",
            explanation="Use 'for' with a duration.",
            focus="grammar",
        ),
        QuizQuestion(
            id="q4",
            type="multiple_choice",
            prompt=f"Which phrase best fits this learning focus: {focus_text or topic_display}?",
            options=[
                "Could you explain that again?",
                "Explain again you can?",
                "You explain again?",
                "Again explain please me?",
            ],
            correct_answer="Could you explain that again?",
            explanation="This is a polite and natural request.",
            focus="speaking",
        ),
        QuizQuestion(
            id="q5",
            type="fill_blank",
            prompt="Complete the sentence: She is interested ___ learning English.",
            options=[],
            correct_answer="in",
            explanation="The fixed phrase is 'interested in'.",
            focus="vocabulary",
        ),
    ]
    return base[:count]


async def _recent_error_focus(db, user_id: str) -> str:
    result = await db.execute(
        select(ErrorLog)
        .where(ErrorLog.user_id == user_id)
        .order_by(desc(ErrorLog.created_at))
        .limit(8)
    )
    errors = result.scalars().all()
    if not errors:
        return ""

    lines = []
    for item in errors:
        original = (item.original_text or "").strip()
        correction = (item.corrected_text or "").strip()
        explanation = (item.explanation or "").strip()
        if original and correction:
            lines.append(f"- {item.error_type}: {original} -> {correction}. {explanation}")
    return "\n".join(lines)


async def _generate_quiz(req: QuizGenerateRequest, focus_text: str) -> GeneratedQuiz:
    topic_display = req.topic.replace("_", " ")
    title = req.title or f"{req.level} {topic_display.title()} Quiz"
    prompt = f"""
Create a short English learning quiz.

Requirements:
- CEFR level: {req.level}
- Topic: {topic_display}
- Number of questions: {req.question_count}
- Use a mix of multiple_choice and fill_blank.
- For multiple_choice, provide exactly 4 options and one correct_answer that exactly matches one option.
- For fill_blank, provide no options and a short correct_answer.
- Keep prompts practical for an English speaking learner.
- Focus on these learner issues when available:
{focus_text or req.focus or "general grammar, vocabulary, and speaking accuracy"}

Return structured data only.
"""
    try:
        llm = get_model(settings.DEFAULT_MODEL, temperature=0.25).with_structured_output(GeneratedQuiz)
        generated: GeneratedQuiz = await llm.ainvoke(
            [
                SystemMessage(content="You create reliable English quizzes for language learners."),
                HumanMessage(content=prompt),
            ]
        )
        questions = []
        for index, question in enumerate(generated.questions[: req.question_count], start=1):
            data = question.model_dump()
            data["id"] = data.get("id") or f"q{index}"
            if data.get("type") == "multiple_choice" and data.get("correct_answer") not in data.get("options", []):
                data["options"] = [data.get("correct_answer", "")] + data.get("options", [])[:3]
            questions.append(QuizQuestion.model_validate(data))
        if len(questions) >= 3:
            return GeneratedQuiz(
                title=generated.title or title,
                description=generated.description,
                questions=questions,
            )
    except Exception as exc:
        logger.warning(f"Quiz generation failed, using fallback quiz: {exc}")

    return GeneratedQuiz(
        title=title,
        description="Practice quiz generated from your current learning focus.",
        questions=_fallback_questions(req.topic, req.level, req.question_count, focus_text),
    )


def _score_quiz(questions: list[QuizQuestion], answers: dict[str, str]) -> tuple[int, int, list[QuestionResult]]:
    results = []
    correct_count = 0

    for question in questions:
        user_answer = answers.get(question.id, "")
        expected = question.correct_answer
        is_correct = _normalize_answer(user_answer) == _normalize_answer(expected)
        if is_correct:
            correct_count += 1
        results.append(
            QuestionResult(
                question_id=question.id,
                prompt=question.prompt,
                focus=question.focus,
                user_answer=user_answer,
                correct_answer=expected,
                is_correct=is_correct,
                explanation=question.explanation,
            )
        )

    total = len(questions)
    score = round((correct_count / total) * 100) if total else 0
    return score, correct_count, results


def _fallback_review(score: int, results: list[QuestionResult]) -> QuizReview:
    wrong = [item for item in results if not item.is_correct]
    focus_counts = Counter(item.focus for item in wrong)
    improvement_areas = [
        f"{focus.replace('_', ' ')}: review {count} missed question{'s' if count > 1 else ''}"
        for focus, count in focus_counts.most_common(3)
    ]
    if not improvement_areas:
        improvement_areas = ["Keep reviewing the same pattern to make it automatic."]

    return QuizReview(
        summary=f"You scored {score}%. The next practice should focus on the mistakes from this quiz.",
        strengths=["You completed the quiz and created measurable practice data."],
        improvement_areas=improvement_areas,
        next_steps=[
            "Redo the missed questions without looking at the answer.",
            "Use each corrected sentence in one new spoken sentence.",
            "Take another short quiz after one conversation session.",
        ],
    )


async def _build_ai_review(quiz: Quiz, score: int, results: list[QuestionResult]) -> QuizReview:
    wrong_items = [item.model_dump() for item in results if not item.is_correct]
    prompt = f"""
Review this English learner quiz result.

Quiz: {quiz.title}
Topic: {quiz.topic}
Level: {quiz.level}
Score: {score}
Wrong answers:
{wrong_items}

Return a short coaching review with:
- summary
- strengths
- improvement_areas
- next_steps
Keep it concrete and useful for the next study session.
"""
    try:
        llm = get_model(settings.DEFAULT_MODEL, temperature=0.2).with_structured_output(QuizReview)
        review: QuizReview = await llm.ainvoke(
            [
                SystemMessage(content="You are an English tutor reviewing quiz results."),
                HumanMessage(content=prompt),
            ]
        )
        return review
    except Exception as exc:
        logger.warning(f"Quiz AI review failed, using fallback review: {exc}")
        return _fallback_review(score, results)


@router.post("", response_model=QuizResponse)
async def create_quiz(req: QuizCreateRequest, user: User = Depends(get_current_user)):
    if len(req.questions) < 1:
        raise HTTPException(status_code=422, detail="At least one question is required")

    factory = get_session_factory()
    async with factory() as db:
        quiz = Quiz(
            user_id=user.id,
            title=req.title.strip() or "English practice quiz",
            topic=req.topic,
            level=req.level,
            source=req.source,
            description=req.description,
            questions_json=[item.model_dump() for item in req.questions],
        )
        db.add(quiz)
        await db.commit()
        await db.refresh(quiz)
        return _quiz_response(quiz)


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz(req: QuizGenerateRequest, user: User = Depends(get_current_user)):
    factory = get_session_factory()
    async with factory() as db:
        focus_text = await _recent_error_focus(db, user.id) if req.source == "mistakes" else ""
        generated = await _generate_quiz(req, focus_text)
        quiz = Quiz(
            user_id=user.id,
            title=generated.title,
            topic=req.topic,
            level=req.level,
            source="mistakes" if req.source == "mistakes" else "ai",
            description=generated.description,
            questions_json=[item.model_dump() for item in generated.questions],
        )
        db.add(quiz)
        await db.commit()
        await db.refresh(quiz)
        return _quiz_response(quiz)


@router.get("", response_model=list[QuizListItem])
async def list_quizzes(
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
):
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .where(Quiz.user_id == user.id)
            .order_by(desc(Quiz.created_at))
            .limit(limit)
            .offset(offset)
        )
        quizzes = result.scalars().all()
        items = []
        for quiz in quizzes:
            attempt_result = await db.execute(
                select(QuizAttempt)
                .where(QuizAttempt.quiz_id == quiz.id, QuizAttempt.user_id == user.id)
                .order_by(desc(QuizAttempt.created_at))
                .limit(1)
            )
            latest_attempt = attempt_result.scalar_one_or_none()
            items.append(
                QuizListItem(
                    id=quiz.id,
                    title=quiz.title,
                    topic=quiz.topic,
                    level=quiz.level,
                    source=quiz.source,
                    question_count=len(quiz.questions_json or []),
                    created_at=quiz.created_at,
                    latest_score=latest_attempt.score if latest_attempt else None,
                )
            )
        return items


@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(quiz_id: str, user: User = Depends(get_current_user)):
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(select(Quiz).where(Quiz.id == quiz_id, Quiz.user_id == user.id))
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        return _quiz_response(quiz)


@router.post("/{quiz_id}/submit", response_model=QuizAttemptResponse)
async def submit_quiz(quiz_id: str, req: QuizAnswerSubmit, user: User = Depends(get_current_user)):
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(select(Quiz).where(Quiz.id == quiz_id, Quiz.user_id == user.id))
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        questions = [QuizQuestion.model_validate(item) for item in quiz.questions_json or []]
        score, correct_count, question_results = _score_quiz(questions, req.answers)
        review = await _build_ai_review(quiz, score, question_results)

        attempt = QuizAttempt(
            quiz_id=quiz.id,
            user_id=user.id,
            answers_json=req.answers,
            result_json=[item.model_dump() for item in question_results],
            ai_review_json=review.model_dump(),
            score=score,
            correct_count=correct_count,
            total_questions=len(questions),
        )
        db.add(attempt)
        await db.commit()
        await db.refresh(attempt)

        return QuizAttemptResponse(
            id=attempt.id,
            quiz_id=quiz.id,
            quiz_title=quiz.title,
            score=score,
            correct_count=correct_count,
            total_questions=len(questions),
            results=question_results,
            ai_review=review,
            created_at=attempt.created_at,
        )


@router.get("/attempts/{attempt_id}", response_model=QuizAttemptResponse)
async def get_quiz_attempt(attempt_id: str, user: User = Depends(get_current_user)):
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(QuizAttempt, Quiz)
            .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
            .where(QuizAttempt.id == attempt_id, QuizAttempt.user_id == user.id)
        )
        row = result.one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Quiz attempt not found")
        attempt, quiz = row
        return QuizAttemptResponse(
            id=attempt.id,
            quiz_id=quiz.id,
            quiz_title=quiz.title,
            score=attempt.score,
            correct_count=attempt.correct_count,
            total_questions=attempt.total_questions,
            results=[QuestionResult.model_validate(item) for item in attempt.result_json or []],
            ai_review=QuizReview.model_validate(attempt.ai_review_json or {}),
            created_at=attempt.created_at,
        )
