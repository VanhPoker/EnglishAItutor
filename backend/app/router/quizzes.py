"""Quiz router - create quizzes, submit answers, and review weak areas."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from ipaddress import ip_address
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urljoin, urlparse
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, desc, or_, select
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_role
from app.core.llm import get_model
from app.core.settings import settings
from app.core.subscriptions import assert_quota_available
from app.database.connection import get_session_factory
from app.database.models import ErrorLog, Quiz, QuizAttempt, QuizSet, User
from app.utils.curated_quiz_sets import CURATED_OPEN_QUIZ_SETS

router = APIRouter(prefix="/quizzes", tags=["Quizzes"])

QuestionType = Literal["multiple_choice", "fill_blank"]
QuizSource = Literal["ai", "manual", "mistakes", "imported", "open_source"]
QuizSourcePreset = Literal["cefr_core", "wikibooks_grammar", "tatoeba_sentences", "thpt_2025_format", "custom_url"]
CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
MAX_LEARNER_LEVEL_DISTANCE = 2
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_SOURCE_TEXT_CHARS = 7000
QUIZ_IMAGE_DIR = Path(__file__).resolve().parents[1] / "uploads" / "quiz-images"
QUIZ_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

SOURCE_PRESETS = {
    "cefr_core": {
        "title": "CEFR A1-C2 Skill Bank",
        "url": "https://www.coe.int/web/portfolio/self-assessment-grid",
        "license": "Council of Europe CEFR descriptors; use as alignment reference.",
        "attribution": "Council of Europe - Common European Framework of Reference for Languages.",
        "guidance": "Create original English learner questions aligned to CEFR can-do descriptors.",
    },
    "wikibooks_grammar": {
        "title": "Wikibooks English Grammar",
        "url": "https://en.wikibooks.org/wiki/English_Grammar",
        "license": "Wikibooks content is generally CC BY-SA; preserve attribution if reused.",
        "attribution": "Wikibooks contributors - English Grammar.",
        "guidance": "Create original grammar questions from standard English grammar concepts.",
    },
    "tatoeba_sentences": {
        "title": "Tatoeba Sentence Practice",
        "url": "https://tatoeba.org/en/downloads",
        "license": "Tatoeba text exports are CC BY 2.0 FR, with some CC0 subsets.",
        "attribution": "Tatoeba Project contributors.",
        "guidance": "Create sentence-level vocabulary, grammar, and fill-blank practice inspired by open sentence corpora.",
    },
    "thpt_2025_format": {
        "title": "THPT 2025 English Format",
        "url": "https://xaydungchinhsach.chinhphu.vn/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-11923122912242127.htm",
        "license": "Use as exam-format reference; generate original questions unless reuse rights are confirmed.",
        "attribution": "Vietnam Ministry of Education and Training format reference.",
        "guidance": "Create original multiple-choice questions similar in structure to Vietnam THPT English reading and language-use tasks.",
    },
}


class QuizQuestion(BaseModel):
    id: str
    type: QuestionType = "multiple_choice"
    prompt: str
    options: list[str] = Field(default_factory=list)
    correct_answer: str
    explanation: str = ""
    focus: str = "grammar"
    image_url: Optional[str] = None

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        return cleaned[:6]

    @field_validator("image_url")
    @classmethod
    def normalize_image_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class QuizQuestionPublic(BaseModel):
    id: str
    type: QuestionType
    prompt: str
    options: list[str] = Field(default_factory=list)
    explanation: str = ""
    focus: str = "grammar"
    image_url: Optional[str] = None


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


class QuizImportItem(BaseModel):
    title: str = "Imported English quiz"
    topic: str = "free_conversation"
    level: str = "B1"
    description: Optional[str] = None
    questions: list[QuizQuestion] = Field(default_factory=list)


class QuizImportRequest(BaseModel):
    quizzes: list[QuizImportItem] = Field(default_factory=list, max_length=50)


class QuizSourceImportRequest(BaseModel):
    preset: QuizSourcePreset = "cefr_core"
    source_url: Optional[str] = None
    topic: str = "free_conversation"
    level: str = "B1"
    quiz_count: int = Field(default=3, ge=1, le=10)
    questions_per_quiz: int = Field(default=5, ge=3, le=10)
    focus: Optional[str] = None


class QuizSourceSetGenerateRequest(BaseModel):
    topic: str = "free_conversation"
    level: str = "B1"
    presets: list[QuizSourcePreset] = Field(
        default_factory=lambda: ["cefr_core", "wikibooks_grammar", "tatoeba_sentences", "thpt_2025_format"],
        max_length=4,
    )
    quiz_count_per_set: int = Field(default=3, ge=1, le=6)
    questions_per_quiz: int = Field(default=5, ge=3, le=10)
    focus: Optional[str] = None


class QuizAnswerSubmit(BaseModel):
    answers: dict[str, str]


class QuizResponse(BaseModel):
    id: str
    title: str
    topic: str
    level: str
    source: str
    quiz_set_id: Optional[str] = None
    quiz_set_title: Optional[str] = None
    description: Optional[str]
    question_count: int
    questions: list[QuizQuestionPublic]
    created_at: datetime


class QuizAdminResponse(QuizResponse):
    questions: list[QuizQuestion]


class QuizUpdateRequest(BaseModel):
    title: str = "English practice quiz"
    topic: str = "free_conversation"
    level: str = "B1"
    description: Optional[str] = None
    questions: list[QuizQuestion] = Field(default_factory=list)


class QuizListItem(BaseModel):
    id: str
    title: str
    topic: str
    level: str
    source: str
    quiz_set_id: Optional[str] = None
    quiz_set_title: Optional[str] = None
    question_count: int
    created_at: datetime
    latest_score: Optional[int] = None
    is_locked: bool = False
    level_distance: int = 0


class QuizSetResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    source: str
    source_preset: Optional[str] = None
    source_title: Optional[str] = None
    source_url: Optional[str] = None
    license: Optional[str] = None
    attribution: Optional[str] = None
    topic: str
    level: str
    quiz_count: int
    question_count: int
    latest_score: Optional[int] = None
    is_locked: bool = False
    level_distance: int = 0
    created_at: datetime


class QuizSetDetailResponse(QuizSetResponse):
    quizzes: list[QuizListItem] = Field(default_factory=list)


class QuizSetGenerateResponse(BaseModel):
    generated_count: int
    quiz_count: int
    question_count: int
    sets: list[QuizSetDetailResponse]


class QuizImportResponse(BaseModel):
    imported_count: int
    question_count: int
    quizzes: list[QuizListItem]


class QuizSourceImportResponse(QuizImportResponse):
    source_title: str
    source_url: Optional[str] = None
    license: str
    attribution: str


class CuratedQuizSyncRequest(BaseModel):
    replace_existing: bool = True


class CuratedQuizSyncResponse(BaseModel):
    deleted_quiz_count: int
    deleted_set_count: int
    imported_quiz_count: int
    imported_set_count: int
    question_count: int
    sets: list[QuizSetDetailResponse]


class QuizImageUploadResponse(BaseModel):
    url: str
    file_name: str


class QuestionResult(BaseModel):
    question_id: str
    prompt: str
    focus: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    explanation: str = ""
    image_url: Optional[str] = None


class QuizReview(BaseModel):
    summary: str
    strengths: list[str] = Field(default_factory=list)
    improvement_areas: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


class LearnerFocusInsight(BaseModel):
    focus: str
    accuracy: int
    correct_count: int
    total_count: int


class LearnerQuizProfile(BaseModel):
    attempts_analyzed: int = 0
    total_questions_analyzed: int = 0
    average_score: Optional[int] = None
    recent_trend: Literal["improving", "steady", "declining", "insufficient_data"] = "insufficient_data"
    summary: str = ""
    strongest_focuses: list[LearnerFocusInsight] = Field(default_factory=list)
    weakest_focuses: list[LearnerFocusInsight] = Field(default_factory=list)
    recommended_focuses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


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
    learner_profile: LearnerQuizProfile
    created_at: datetime


class GeneratedQuiz(BaseModel):
    title: str
    description: str
    questions: list[GeneratedQuizQuestion]


class GeneratedQuizBatch(BaseModel):
    quizzes: list[GeneratedQuiz] = Field(default_factory=list)


def _normalize_answer(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower()).strip(" .!?;:,")


def _level_index(level: str | None) -> int:
    normalized = (level or "B1").strip().upper()
    return CEFR_LEVELS.index(normalized) if normalized in CEFR_LEVELS else CEFR_LEVELS.index("B1")


def _level_distance(left: str | None, right: str | None) -> int:
    return abs(_level_index(left) - _level_index(right))


def _is_level_allowed(user: User, quiz_level: str | None) -> bool:
    if user.role == "admin":
        return True
    return _level_distance(user.cefr_level, quiz_level) <= MAX_LEARNER_LEVEL_DISTANCE


def _assert_level_allowed(user: User, quiz_level: str | None) -> None:
    if _is_level_allowed(user, quiz_level):
        return
    raise HTTPException(
        status_code=403,
        detail=(
            f"Trình độ hiện tại của bạn là {user.cefr_level}. "
            "Bạn chỉ được làm các bài gần trình độ hiện tại. Hãy nhờ admin điều chỉnh nếu cần."
        ),
    )


def _normalize_questions(questions: list[QuizQuestion]) -> list[QuizQuestion]:
    normalized = []
    for index, question in enumerate(questions[:100], start=1):
        prompt = question.prompt.strip()
        correct_answer = question.correct_answer.strip()
        explanation = question.explanation.strip()
        focus = question.focus.strip() or "grammar"

        if not prompt or not correct_answer:
            continue

        options = [item.strip() for item in question.options if item and item.strip()]
        if question.type == "multiple_choice":
            answer_key = correct_answer.strip().upper()
            key_map = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5, "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5}
            if answer_key in key_map and key_map[answer_key] < len(options):
                correct_answer = options[key_map[answer_key]]

            if correct_answer not in options:
                options = [correct_answer, *[item for item in options if _normalize_answer(item) != _normalize_answer(correct_answer)]]
            options = options[:6]
        else:
            options = []

        normalized.append(
            QuizQuestion(
                id=question.id.strip() or f"q{index}",
                type=question.type,
                prompt=prompt,
                options=options,
                correct_answer=correct_answer,
                explanation=explanation,
                focus=focus,
                image_url=question.image_url,
            )
        )
    return normalized


def _public_question(question: dict) -> QuizQuestionPublic:
    data = QuizQuestion.model_validate(question)
    return QuizQuestionPublic(
        id=data.id,
        type=data.type,
        prompt=data.prompt,
        options=data.options,
        explanation=data.explanation,
        focus=data.focus,
        image_url=data.image_url,
    )


def _generated_questions_from_quiz_questions(questions: list[QuizQuestion]) -> list[GeneratedQuizQuestion]:
    return [GeneratedQuizQuestion.model_validate(question.model_dump()) for question in questions]


def _quiz_response(quiz: Quiz) -> QuizResponse:
    questions = [_public_question(item) for item in quiz.questions_json or []]
    quiz_set = quiz.__dict__.get("quiz_set")
    return QuizResponse(
        id=quiz.id,
        title=quiz.title,
        topic=quiz.topic,
        level=quiz.level,
        source=quiz.source,
        quiz_set_id=quiz.quiz_set_id,
        quiz_set_title=quiz_set.title if quiz_set else None,
        description=quiz.description,
        question_count=len(questions),
        questions=questions,
        created_at=quiz.created_at,
    )


def _quiz_admin_response(quiz: Quiz) -> QuizAdminResponse:
    questions = [QuizQuestion.model_validate(item) for item in quiz.questions_json or []]
    base = _quiz_response(quiz)
    return QuizAdminResponse(**base.model_dump(exclude={"questions"}), questions=questions)


def _quiz_list_item(quiz: Quiz, user: User, latest_attempt: QuizAttempt | None = None) -> QuizListItem:
    distance = _level_distance(user.cefr_level, quiz.level) if user.role == "learner" else 0
    quiz_set = quiz.__dict__.get("quiz_set")
    return QuizListItem(
        id=quiz.id,
        title=quiz.title,
        topic=quiz.topic,
        level=quiz.level,
        source=quiz.source,
        quiz_set_id=quiz.quiz_set_id,
        quiz_set_title=quiz_set.title if quiz_set else None,
        question_count=len(quiz.questions_json or []),
        created_at=quiz.created_at,
        latest_score=latest_attempt.score if latest_attempt else None,
        is_locked=user.role == "learner" and distance > MAX_LEARNER_LEVEL_DISTANCE,
        level_distance=distance,
    )


def _quiz_set_response(quiz_set: QuizSet, quizzes: list[QuizListItem], user: User) -> QuizSetDetailResponse:
    latest_scores = [item.latest_score for item in quizzes if item.latest_score is not None]
    question_count = sum(item.question_count for item in quizzes)
    distance = _level_distance(user.cefr_level, quiz_set.level) if user.role == "learner" else 0
    return QuizSetDetailResponse(
        id=quiz_set.id,
        title=quiz_set.title,
        description=quiz_set.description,
        source=quiz_set.source,
        source_preset=quiz_set.source_preset,
        source_title=quiz_set.source_title,
        source_url=quiz_set.source_url,
        license=quiz_set.license,
        attribution=quiz_set.attribution,
        topic=quiz_set.topic,
        level=quiz_set.level,
        quiz_count=len(quizzes),
        question_count=question_count,
        latest_score=latest_scores[0] if latest_scores else None,
        is_locked=user.role == "learner" and distance > MAX_LEARNER_LEVEL_DISTANCE,
        level_distance=distance,
        created_at=quiz_set.created_at,
        quizzes=quizzes,
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


async def _recent_errors(db, user_id: str, limit: int = 8) -> list[ErrorLog]:
    result = await db.execute(
        select(ErrorLog)
        .where(ErrorLog.user_id == user_id)
        .order_by(desc(ErrorLog.created_at))
        .limit(limit)
    )
    return result.scalars().all()


async def _recent_wrong_quiz_results(db, user_id: str, attempt_limit: int = 8, result_limit: int = 8) -> list[QuestionResult]:
    attempt_rows = await db.execute(
        select(QuizAttempt)
        .where(QuizAttempt.user_id == user_id)
        .order_by(desc(QuizAttempt.created_at))
        .limit(attempt_limit)
    )
    wrong_results: list[QuestionResult] = []
    for attempt in attempt_rows.scalars().all():
        for item in attempt.result_json or []:
            result = QuestionResult.model_validate(item)
            if not result.is_correct:
                wrong_results.append(result)
                if len(wrong_results) >= result_limit:
                    return wrong_results
    return wrong_results


def _replace_first_exact(text: str, needle: str) -> str:
    if not text or not needle:
        return text
    pattern = re.compile(re.escape(needle), flags=re.IGNORECASE)
    return pattern.sub("_____", text, count=1)


def _difference_phrase(original: str, corrected: str) -> str | None:
    original_tokens = re.findall(r"[A-Za-z']+", original or "")
    corrected_tokens = re.findall(r"[A-Za-z']+", corrected or "")
    if not corrected_tokens:
        return None

    original_norm = {_normalize_answer(token) for token in original_tokens if token.strip()}
    novel = [token for token in corrected_tokens if _normalize_answer(token) not in original_norm]
    if novel:
        candidate = " ".join(novel[:2]).strip()
        return candidate or None

    for index, token in enumerate(corrected_tokens):
        if index >= len(original_tokens) or _normalize_answer(original_tokens[index]) != _normalize_answer(token):
            return token
    return corrected_tokens[-1]


def _generic_wrong_variants(corrected: str, focus: str) -> list[str]:
    sentence = corrected.strip()
    variants: list[str] = []
    if not sentence:
        return variants

    lowered = sentence.lower()
    if focus == "grammar":
        if " is " in lowered:
            variants.append(re.sub(r"\bis\b", "are", sentence, count=1, flags=re.IGNORECASE))
        if " are " in lowered:
            variants.append(re.sub(r"\bare\b", "is", sentence, count=1, flags=re.IGNORECASE))
        if " have " in lowered:
            variants.append(re.sub(r"\bhave\b", "has", sentence, count=1, flags=re.IGNORECASE))
        if " has " in lowered:
            variants.append(re.sub(r"\bhas\b", "have", sentence, count=1, flags=re.IGNORECASE))
        if " to " in lowered:
            variants.append(re.sub(r"\bto\b\s+", "", sentence, count=1, flags=re.IGNORECASE))
    if focus in {"word_choice", "vocabulary"}:
        if " for " in lowered:
            variants.append(re.sub(r"\bfor\b", "since", sentence, count=1, flags=re.IGNORECASE))
        if " in " in lowered:
            variants.append(re.sub(r"\bin\b", "on", sentence, count=1, flags=re.IGNORECASE))
        if " on " in lowered:
            variants.append(re.sub(r"\bon\b", "in", sentence, count=1, flags=re.IGNORECASE))
    if focus == "speaking" and sentence.endswith("?"):
        variants.append(sentence.rstrip("?"))

    words = sentence.split()
    if len(words) > 3:
        variants.append(" ".join(words[:-1]))
    return [item.strip() for item in variants if item and _normalize_answer(item) != _normalize_answer(sentence)]


def _build_error_based_question(item: ErrorLog, index: int) -> QuizQuestion | None:
    original = (item.original_text or "").strip()
    corrected = (item.corrected_text or "").strip()
    explanation = (item.explanation or "").strip()
    focus = (item.error_type or "grammar").strip() or "grammar"
    if not corrected:
        return None

    answer_phrase = _difference_phrase(original, corrected)
    if answer_phrase and len(answer_phrase.split()) <= 3:
        prompt = _replace_first_exact(corrected, answer_phrase)
        if prompt != corrected and "_____" in prompt:
            return QuizQuestion(
                id=f"q{index}",
                type="fill_blank",
                prompt=f"Complete the corrected sentence: {prompt}",
                options=[],
                correct_answer=answer_phrase,
                explanation=explanation or "Điền lại đúng phần mà bạn đã sai trong phiên học trước.",
                focus=focus,
            )

    distractors = []
    if original and _normalize_answer(original) != _normalize_answer(corrected):
        distractors.append(original)
    distractors.extend(_generic_wrong_variants(corrected, focus))

    options = []
    seen = set()
    for candidate in [corrected, *distractors]:
        normalized = _normalize_answer(candidate)
        if not candidate or normalized in seen:
            continue
        seen.add(normalized)
        options.append(candidate)
        if len(options) == 4:
            break

    while len(options) < 4:
        filler = f"{corrected.rstrip('.')} please" if len(options) == 2 else f"{corrected.rstrip('.')} yesterday"
        normalized = _normalize_answer(filler)
        if normalized not in seen:
            seen.add(normalized)
            options.append(filler)
        else:
            options.append(f"{corrected.rstrip('.')} now")

    return QuizQuestion(
        id=f"q{index}",
        type="multiple_choice",
        prompt="Choose the better sentence to say.",
        options=options[:4],
        correct_answer=corrected,
        explanation=explanation or "Chọn lại cách nói đúng thay vì lặp lại mẫu sai cũ.",
        focus=focus,
    )


def _build_result_based_question(item: QuestionResult, index: int) -> QuizQuestion | None:
    expected = (item.correct_answer or "").strip()
    prompt = (item.prompt or "").strip()
    explanation = (item.explanation or "").strip()
    focus = (item.focus or "grammar").strip() or "grammar"
    user_answer = (item.user_answer or "").strip()
    if not expected or not prompt:
        return None

    if len(expected.split()) <= 4:
        normalized_prompt = prompt if prompt.endswith("?") else prompt.rstrip(".")
        return QuizQuestion(
            id=f"q{index}",
            type="fill_blank",
            prompt=f"Review this previous quiz item and type the correct answer: {normalized_prompt}",
            options=[],
            correct_answer=expected,
            explanation=explanation or "Đây là đáp án đúng của câu bạn đã từng làm sai.",
            focus=focus,
        )

    options = []
    seen = set()
    for candidate in [expected, user_answer, *_generic_wrong_variants(expected, focus)]:
        normalized = _normalize_answer(candidate)
        if not candidate or normalized in seen:
            continue
        seen.add(normalized)
        options.append(candidate)
        if len(options) == 4:
            break
    if len(options) < 2:
        return None
    while len(options) < 4:
        filler = f"{expected.rstrip('.')} now"
        normalized = _normalize_answer(filler)
        if normalized not in seen:
            seen.add(normalized)
            options.append(filler)
        else:
            options.append(f"{expected.rstrip('.')} yesterday")

    return QuizQuestion(
        id=f"q{index}",
        type="multiple_choice",
        prompt=f"Review this idea from a previous quiz: {prompt}",
        options=options[:4],
        correct_answer=expected,
        explanation=explanation or "Chọn lại phương án đúng của câu bạn đã từng làm sai.",
        focus=focus,
    )


def _focus_template_question(focus: str, level: str, index: int) -> QuizQuestion:
    topic = focus.replace("_", " ")
    templates = {
        "grammar": QuizQuestion(
            id=f"q{index}",
            type="multiple_choice",
            prompt=f"Choose the most accurate {level} sentence.",
            options=[
                "She has worked here for three years.",
                "She have worked here for three years.",
                "She has work here for three years.",
                "She working here for three years.",
            ],
            correct_answer="She has worked here for three years.",
            explanation="Use 'has + past participle' for the present perfect with 'she'.",
            focus="grammar",
        ),
        "vocabulary": QuizQuestion(
            id=f"q{index}",
            type="fill_blank",
            prompt="Complete the sentence: I am interested _____ joining the English club this semester.",
            options=[],
            correct_answer="in",
            explanation="The fixed expression is 'interested in'.",
            focus="vocabulary",
        ),
        "word_choice": QuizQuestion(
            id=f"q{index}",
            type="multiple_choice",
            prompt="Choose the most natural request.",
            options=[
                "Could you explain that part again?",
                "Could you explain again that part me?",
                "Explain that part again you could?",
                "You could explain that part again me?",
            ],
            correct_answer="Could you explain that part again?",
            explanation="This is the most natural and polite way to ask for clarification.",
            focus="word_choice",
        ),
        "speaking": QuizQuestion(
            id=f"q{index}",
            type="multiple_choice",
            prompt="Which answer sounds clearer in conversation?",
            options=[
                "I think we should test it first and then decide.",
                "I think should test first then decide it.",
                "We should decide it then test first I think.",
                "Think I should test it and decide then.",
            ],
            correct_answer="I think we should test it first and then decide.",
            explanation="A clear spoken answer keeps the subject and verbs in a natural order.",
            focus="speaking",
        ),
        "comprehension": QuizQuestion(
            id=f"q{index}",
            type="fill_blank",
            prompt="Complete the summary sentence: The main _____ is that students should review after each lesson.",
            options=[],
            correct_answer="point",
            explanation="The fixed phrase is 'the main point'.",
            focus="comprehension",
        ),
        "reading": QuizQuestion(
            id=f"q{index}",
            type="multiple_choice",
            prompt=f"Choose the sentence that best matches a short {topic} task.",
            options=[
                "Students must submit the form before Friday noon.",
                "Students submit the form before Friday noon must.",
                "Before Friday noon must submit students the form.",
                "Students before Friday noon submit must the form.",
            ],
            correct_answer="Students must submit the form before Friday noon.",
            explanation="This sentence is the clearest reading-based instruction.",
            focus="reading",
        ),
    }
    return templates.get(focus, templates["grammar"])


def _build_personalized_fallback_questions(
    errors: list[ErrorLog],
    wrong_results: list[QuestionResult],
    learner_profile: LearnerQuizProfile,
    level: str,
    count: int,
) -> list[QuizQuestion]:
    questions: list[QuizQuestion] = []
    for item in errors:
        question = _build_error_based_question(item, len(questions) + 1)
        if question:
            questions.append(question)
        if len(questions) >= count:
            return questions[:count]

    for item in wrong_results:
        question = _build_result_based_question(item, len(questions) + 1)
        if question:
            questions.append(question)
        if len(questions) >= count:
            return questions[:count]

    used_focuses = {question.focus for question in questions}
    for focus in learner_profile.recommended_focuses or ["grammar", "speaking", "word_choice"]:
        selected_focus = focus if focus not in used_focuses else "grammar"
        questions.append(_focus_template_question(selected_focus, level, len(questions) + 1))
        used_focuses.add(selected_focus)
        if len(questions) >= count:
            return questions[:count]

    while len(questions) < count:
        questions.append(_focus_template_question("grammar", level, len(questions) + 1))
    return questions[:count]


class _ReadableTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        cleaned = " ".join(data.split())
        if len(cleaned) >= 30:
            self._chunks.append(cleaned)

    def text(self) -> str:
        return "\n".join(self._chunks)


def _safe_source_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=422, detail="URL nguồn phải là http hoặc https hợp lệ.")

    host = parsed.hostname.lower()
    if host in {"localhost", "0.0.0.0"} or host.endswith(".local"):
        raise HTTPException(status_code=422, detail="Không hỗ trợ crawl URL nội bộ.")
    try:
        ip = ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise HTTPException(status_code=422, detail="Không hỗ trợ crawl URL nội bộ.")
    except ValueError:
        pass
    return parsed.geturl()


def _extract_source_text(raw: str) -> str:
    parser = _ReadableTextParser()
    parser.feed(raw)
    text = parser.text() or raw
    text = re.sub(r"\s+", " ", text)
    return text[:MAX_SOURCE_TEXT_CHARS]


async def _fetch_source_text(url: str | None) -> str:
    if not url:
        return ""
    current_url = _safe_source_url(url)
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
            response = None
            for _ in range(4):
                response = await client.get(
                    current_url,
                    headers={"User-Agent": "EnglishAItutorQuizCrawler/1.0"},
                )
                if response.status_code not in {301, 302, 303, 307, 308}:
                    break
                location = response.headers.get("location")
                if not location:
                    break
                current_url = _safe_source_url(urljoin(current_url, location))
            if response is None:
                return ""
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if "text" not in content_type and "html" not in content_type and "json" not in content_type:
                return ""
            return _extract_source_text(response.text)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Could not fetch quiz source {url}: {exc}")
        return ""


def _source_info(req: QuizSourceImportRequest) -> dict:
    if req.preset == "custom_url":
        if not req.source_url:
            raise HTTPException(status_code=422, detail="Hãy nhập URL nguồn cần crawl.")
        return {
            "title": "Nguồn tuỳ chỉnh",
            "url": req.source_url,
            "license": "Custom source; verify reuse rights before publishing.",
            "attribution": req.source_url,
            "guidance": "Create original English learning questions from the provided source text.",
        }

    preset = SOURCE_PRESETS[req.preset]
    return {
        **preset,
        "url": req.source_url or preset["url"],
    }


def _curated_import_items(seed: dict) -> list[QuizImportItem]:
    items: list[QuizImportItem] = []
    for index, raw_quiz in enumerate(seed.get("quizzes", []), start=1):
        questions = _normalize_questions(
            [QuizQuestion.model_validate(question) for question in raw_quiz.get("questions", [])]
        )
        if len(questions) < 3:
            continue
        items.append(
            QuizImportItem(
                title=(raw_quiz.get("title") or f"{seed['title']} #{index}").strip(),
                topic=(raw_quiz.get("topic") or seed.get("topic") or "daily_life").strip(),
                level=(raw_quiz.get("level") or seed.get("level") or "B1").strip(),
                description=(raw_quiz.get("description") or "").strip() or None,
                questions=questions,
            )
        )
    return items


async def _replace_open_source_library(db) -> tuple[int, int]:
    quiz_rows = (
        await db.execute(
            select(Quiz.id, Quiz.quiz_set_id)
            .where(Quiz.source == "open_source")
        )
    ).all()
    quiz_ids = [row[0] for row in quiz_rows]
    set_ids = {row[1] for row in quiz_rows if row[1]}

    explicit_set_ids = (
        await db.execute(select(QuizSet.id).where(QuizSet.source == "open_source"))
    ).scalars().all()
    set_ids.update(explicit_set_ids)

    if quiz_ids:
        await db.execute(delete(QuizAttempt).where(QuizAttempt.quiz_id.in_(quiz_ids)))
        await db.execute(delete(Quiz).where(Quiz.id.in_(quiz_ids)))

    if set_ids:
        await db.execute(delete(QuizSet).where(QuizSet.id.in_(set_ids)))

    return len(quiz_ids), len(set_ids)


async def _sync_curated_open_source_sets(user: User, replace_existing: bool) -> CuratedQuizSyncResponse:
    factory = get_session_factory()
    async with factory() as db:
        deleted_quiz_count = 0
        deleted_set_count = 0
        if replace_existing:
            deleted_quiz_count, deleted_set_count = await _replace_open_source_library(db)

        created_sets: list[QuizSet] = []
        created_quizzes: list[Quiz] = []
        total_questions = 0

        for seed in CURATED_OPEN_QUIZ_SETS:
            items = _curated_import_items(seed)
            if not items:
                continue

            quiz_set = QuizSet(
                created_by=user.id,
                title=seed["title"],
                description=seed.get("description"),
                source="open_source",
                source_preset=seed.get("source_preset"),
                source_title=seed.get("source_title"),
                source_url=seed.get("source_url"),
                license=seed.get("license"),
                attribution=seed.get("attribution"),
                topic=seed.get("topic") or items[0].topic,
                level=seed.get("level") or items[0].level,
            )
            db.add(quiz_set)

            source_note = f"Nguồn: {seed['attribution']}. License: {seed['license']}"
            created_for_set = 0
            for item in items:
                questions = _normalize_questions(item.questions)
                if len(questions) < 3:
                    continue
                total_questions += len(questions)
                description = (item.description or "").strip()
                if source_note not in description:
                    description = f"{description}\n{source_note}".strip()
                quiz = Quiz(
                    user_id=user.id,
                    quiz_set=quiz_set,
                    title=item.title,
                    topic=item.topic,
                    level=item.level,
                    source="open_source",
                    description=description,
                    questions_json=[question.model_dump() for question in questions],
                )
                db.add(quiz)
                created_quizzes.append(quiz)
                created_for_set += 1

            if created_for_set:
                created_sets.append(quiz_set)

        if not created_sets:
            raise HTTPException(status_code=422, detail="Không có bộ quiz curated hợp lệ để import.")

        await db.commit()
        for quiz_set in created_sets:
            await db.refresh(quiz_set)
        for quiz in created_quizzes:
            await db.refresh(quiz)

    set_details: list[QuizSetDetailResponse] = []
    for quiz_set in created_sets:
        quizzes = [_quiz_list_item(quiz, user) for quiz in created_quizzes if quiz.quiz_set_id == quiz_set.id]
        set_details.append(_quiz_set_response(quiz_set, quizzes, user))

    return CuratedQuizSyncResponse(
        deleted_quiz_count=deleted_quiz_count,
        deleted_set_count=deleted_set_count,
        imported_quiz_count=len(created_quizzes),
        imported_set_count=len(created_sets),
        question_count=total_questions,
        sets=set_details,
    )


async def _generate_source_quizzes(req: QuizSourceImportRequest, info: dict, source_text: str) -> list[QuizImportItem]:
    if not (source_text or "").strip():
        raise HTTPException(
            status_code=422,
            detail=(
                f"Không đọc được nội dung từ nguồn {info['title']}. "
                "Hãy thử URL khác, giảm bớt mục tiêu, hoặc dùng import file để đưa đề thật vào hệ thống."
            ),
        )

    topic_display = req.topic.replace("_", " ")
    prompt = f"""
Create a batch of original English learner quizzes for this app.

Source preset: {info['title']}
Source URL: {info.get('url') or 'not provided'}
License note: {info['license']}
Attribution: {info['attribution']}
Source guidance: {info['guidance']}

Target:
- CEFR level: {req.level}
- Topic: {topic_display}
- Focus: {req.focus or 'balanced grammar, vocabulary, reading comprehension, and practical communication'}
- Quiz count: {req.quiz_count}
- Questions per quiz: {req.questions_per_quiz}

Rules:
- Generate original questions; do not copy long copyrighted passages verbatim.
- If the source text is open licensed, still keep prompts concise and add attribution in quiz description.
- Every quiz must contain exactly {req.questions_per_quiz} questions.
- Use only multiple_choice and fill_blank.
- For multiple_choice, provide exactly 4 options and one correct_answer that exactly matches one option.
- For fill_blank, provide no options and a short correct_answer.
- Keep questions useful for Vietnamese learners of English.
- Use focus labels like grammar, vocabulary, word_choice, structure, comprehension, speaking.
- Do not return generic placeholder questions.
- Every quiz should contain concrete, source-grounded language practice.

Source excerpt:
{source_text}

Return structured data only.
"""
    try:
        llm = get_model(settings.DEFAULT_MODEL, temperature=0.25).with_structured_output(GeneratedQuizBatch)
        batch: GeneratedQuizBatch = await llm.ainvoke(
            [
                SystemMessage(content="You create reliable, original English learning quizzes with CEFR-aligned difficulty."),
                HumanMessage(content=prompt),
            ]
        )
        quizzes = []
        for quiz_index, generated in enumerate(batch.quizzes[: req.quiz_count], start=1):
            questions = []
            for question_index, question in enumerate(generated.questions[: req.questions_per_quiz], start=1):
                data = question.model_dump()
                data["id"] = data.get("id") or f"q{question_index}"
                if data.get("type") == "multiple_choice" and data.get("correct_answer") not in data.get("options", []):
                    data["options"] = [data.get("correct_answer", "")] + data.get("options", [])[:3]
                questions.append(QuizQuestion.model_validate(data))
            questions = _normalize_questions(questions)
            if len(questions) >= req.questions_per_quiz:
                quizzes.append(
                    QuizImportItem(
                        title=generated.title or f"{info['title']} - {req.level} #{quiz_index}",
                        topic=req.topic,
                        level=req.level,
                        description=f"{generated.description}\nNguồn: {info['attribution']}. License: {info['license']}",
                        questions=questions[: req.questions_per_quiz],
                    )
                )
        if len(quizzes) >= req.quiz_count:
            return quizzes[: req.quiz_count]
        raise HTTPException(
            status_code=422,
            detail=(
                f"Nguồn {info['title']} đã được đọc, nhưng hệ thống chỉ tạo được {len(quizzes)}/{req.quiz_count} quiz hợp lệ. "
                "Hãy giảm số bộ, đổi focus, hoặc import file nguồn thật."
            ),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Source quiz generation failed without fallback: {exc}")
        raise HTTPException(
            status_code=502,
            detail=(
                f"Hệ thống không thể tạo quiz từ nguồn {info['title']} lúc này. "
                "Không còn fallback mock nữa; hãy thử lại hoặc dùng import file."
            ),
        ) from exc


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
                questions=_generated_questions_from_quiz_questions(questions),
            )
    except Exception as exc:
        logger.warning(f"Quiz generation failed, using fallback quiz: {exc}")

    return GeneratedQuiz(
        title=title,
        description="Practice quiz generated from your current learning focus.",
        questions=_generated_questions_from_quiz_questions(
            _fallback_questions(req.topic, req.level, req.question_count, focus_text)
        ),
    )


async def _generate_personalized_remedial_quiz(
    db,
    user: User,
    topic: str,
    level: str,
    question_count: int,
) -> GeneratedQuiz:
    errors = await _recent_errors(db, user.id, limit=max(6, question_count))
    wrong_results = await _recent_wrong_quiz_results(db, user.id, result_limit=max(6, question_count))
    learner_profile = await _build_learner_profile(db, user.id)

    if not errors and not wrong_results and learner_profile.attempts_analyzed == 0:
        raise HTTPException(
            status_code=422,
            detail="Bạn chưa có đủ dữ liệu lỗi sai. Hãy hoàn thành một phiên học hoặc một bài quiz trước.",
        )

    focus_lines: list[str] = []
    if learner_profile.recommended_focuses:
        focus_lines.append(
            f"- Priority focuses: {', '.join(item.replace('_', ' ') for item in learner_profile.recommended_focuses[:3])}"
        )
    for item in errors[:5]:
        original = (item.original_text or "").strip()
        correction = (item.corrected_text or "").strip()
        explanation = (item.explanation or "").strip()
        if original and correction:
            focus_lines.append(f"- Conversation error ({item.error_type}): {original} -> {correction}. {explanation}")
    for item in wrong_results[:5]:
        focus_lines.append(
            f"- Quiz mistake ({item.focus}): prompt={item.prompt!r}; learner_answer={item.user_answer!r}; "
            f"correct_answer={item.correct_answer!r}; explanation={item.explanation!r}"
        )

    title = f"Ôn lỗi cá nhân - {datetime.utcnow().strftime('%d/%m %H:%M')}"
    description = (
        "Bài ôn cá nhân hóa dựa trên lỗi nói, lỗi quiz gần đây và nhóm kỹ năng còn yếu."
    )
    prompt = f"""
Create a short remedial English quiz for one learner.

Requirements:
- CEFR level: {level}
- Topic context: {topic.replace('_', ' ')}
- Number of questions: {question_count}
- Use only multiple_choice and fill_blank.
- Every question must be directly tied to the learner evidence below.
- At least half of the questions should target actual mistakes the learner made.
- Focus on repair, not trivia.
- For multiple_choice, provide exactly 4 options and one correct_answer that exactly matches one option.
- For fill_blank, provide no options and a short correct_answer.
- Keep prompts practical for Vietnamese learners and suitable for self-study.
- Include short explanations that tell the learner what to notice next time.

Learner evidence:
{chr(10).join(focus_lines) or "- Build a short remedial quiz from recent English practice errors."}

Return structured data only.
"""
    try:
        llm = get_model(settings.DEFAULT_MODEL, temperature=0.2).with_structured_output(GeneratedQuiz)
        generated: GeneratedQuiz = await llm.ainvoke(
            [
                SystemMessage(
                    content=(
                        "You create tight remedial English quizzes. You repair real learner mistakes, "
                        "avoid generic filler, and stay close to the evidence."
                    )
                ),
                HumanMessage(content=prompt),
            ]
        )
        questions = []
        for index, question in enumerate(generated.questions[:question_count], start=1):
            data = question.model_dump()
            data["id"] = data.get("id") or f"q{index}"
            if data.get("type") == "multiple_choice" and data.get("correct_answer") not in data.get("options", []):
                data["options"] = [data.get("correct_answer", "")] + data.get("options", [])[:3]
            questions.append(QuizQuestion.model_validate(data))
        questions = _normalize_questions(questions)
        if len(questions) >= 3:
            return GeneratedQuiz(
                title=generated.title or title,
                description=generated.description or description,
                questions=_generated_questions_from_quiz_questions(questions[:question_count]),
            )
    except Exception as exc:
        logger.warning(f"Personalized remedial quiz generation failed, using deterministic fallback: {exc}")

    fallback_questions = _build_personalized_fallback_questions(
        errors=errors,
        wrong_results=wrong_results,
        learner_profile=learner_profile,
        level=level,
        count=question_count,
    )
    return GeneratedQuiz(
        title=title,
        description=description,
        questions=_generated_questions_from_quiz_questions(fallback_questions),
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
                image_url=question.image_url,
            )
        )

    total = len(questions)
    score = round((correct_count / total) * 100) if total else 0
    return score, correct_count, results


def _trend_from_scores(scores: list[int]) -> Literal["improving", "steady", "declining", "insufficient_data"]:
    if len(scores) < 4:
        return "insufficient_data"

    recent = scores[:3]
    previous = scores[3:6]
    if len(previous) < 2:
        return "insufficient_data"

    recent_avg = sum(recent) / len(recent)
    previous_avg = sum(previous) / len(previous)
    delta = recent_avg - previous_avg
    if delta >= 5:
        return "improving"
    if delta <= -5:
        return "declining"
    return "steady"


def _trend_label(trend: str) -> str:
    return {
        "improving": "đang đi lên",
        "steady": "đang ổn định",
        "declining": "đang chững hoặc giảm",
        "insufficient_data": "chưa đủ dữ liệu",
    }.get(trend, "chưa đủ dữ liệu")


def _focus_insights(results_by_focus: dict[str, list[bool]], descending: bool) -> list[LearnerFocusInsight]:
    insights = []
    min_count = 2 if sum(len(items) for items in results_by_focus.values()) >= 6 else 1
    for focus, values in results_by_focus.items():
        total_count = len(values)
        if total_count < min_count:
            continue
        correct_count = sum(1 for item in values if item)
        accuracy = round((correct_count / total_count) * 100) if total_count else 0
        insights.append(
            LearnerFocusInsight(
                focus=focus,
                accuracy=accuracy,
                correct_count=correct_count,
                total_count=total_count,
            )
        )
    insights.sort(key=lambda item: (item.accuracy, item.total_count), reverse=descending)
    if not descending:
        insights.sort(key=lambda item: (item.accuracy, -item.total_count))
    return insights[:3]


def _profile_recommendations(
    weakest_focuses: list[LearnerFocusInsight],
    recent_trend: str,
    attempts_analyzed: int,
) -> list[str]:
    recommendations = []
    for item in weakest_focuses[:2]:
        recommendations.append(
            f"Tập trung ôn {item.focus.replace('_', ' ')} với bài ngắn 3-5 câu, rồi nói lại đáp án đúng thành câu hoàn chỉnh."
        )

    if recent_trend == "declining":
        recommendations.append("Giảm số câu mỗi bài và tăng tần suất ôn lại để kéo độ chính xác về mức ổn định trước.")
    elif recent_trend == "improving":
        recommendations.append("Giữ nhịp hiện tại và tăng dần độ khó ở đúng nhóm lỗi đang cải thiện.")

    if attempts_analyzed < 3:
        recommendations.append("Làm thêm vài bài ngắn ở các chủ điểm khác nhau để hồ sơ người học ổn định hơn.")

    return recommendations[:4]


def _profile_summary(
    attempts_analyzed: int,
    total_questions_analyzed: int,
    strongest_focuses: list[LearnerFocusInsight],
    weakest_focuses: list[LearnerFocusInsight],
    recent_trend: str,
) -> str:
    if attempts_analyzed == 0 or total_questions_analyzed == 0:
        return "Chưa có đủ dữ liệu quiz để rút ra hồ sơ học tập."

    base = f"Đã phân tích {attempts_analyzed} bài gần nhất với {total_questions_analyzed} câu."
    trend_text = _trend_label(recent_trend)

    if strongest_focuses and weakest_focuses:
        strongest = strongest_focuses[0]
        weakest = weakest_focuses[0]
        return (
            f"{base} Bạn đang tốt hơn ở {strongest.focus.replace('_', ' ')} ({strongest.accuracy}%) "
            f"nhưng còn yếu ở {weakest.focus.replace('_', ' ')} ({weakest.accuracy}%). Xu hướng gần đây {trend_text}."
        )

    if weakest_focuses:
        weakest = weakest_focuses[0]
        return (
            f"{base} Điểm cần ưu tiên nhất hiện tại là {weakest.focus.replace('_', ' ')} "
            f"với độ chính xác khoảng {weakest.accuracy}%. Xu hướng gần đây {trend_text}."
        )

    return f"{base} Kết quả hiện khá cân bằng giữa các nhóm kỹ năng. Xu hướng gần đây {trend_text}."


async def _build_learner_profile(
    db,
    user_id: str,
    current_attempt: Optional[dict] = None,
    limit: int = 12,
) -> LearnerQuizProfile:
    result = await db.execute(
        select(QuizAttempt)
        .where(QuizAttempt.user_id == user_id)
        .order_by(desc(QuizAttempt.created_at))
        .limit(limit)
    )
    stored_attempts = result.scalars().all()

    entries: list[dict] = []
    if current_attempt:
        entries.append(current_attempt)
    for attempt in stored_attempts:
        entries.append(
            {
                "score": int(attempt.score or 0),
                "total_questions": int(attempt.total_questions or 0),
                "results": [QuestionResult.model_validate(item) for item in attempt.result_json or []],
            }
        )

    entries = entries[:limit]
    if not entries:
        return LearnerQuizProfile(
            summary="Chưa có đủ dữ liệu quiz để rút ra hồ sơ học tập.",
        )

    scores = [int(item["score"]) for item in entries]
    focus_map: dict[str, list[bool]] = {}
    total_questions = 0
    for entry in entries:
        total_questions += int(entry["total_questions"] or len(entry["results"]))
        for result_item in entry["results"]:
            focus = (result_item.focus or "grammar").strip() or "grammar"
            focus_map.setdefault(focus, []).append(bool(result_item.is_correct))

    strongest_focuses = _focus_insights(focus_map, descending=True)
    weakest_focuses = _focus_insights(focus_map, descending=False)
    recent_trend = _trend_from_scores(scores)
    recommended_focuses = [item.focus for item in weakest_focuses[:3]]

    return LearnerQuizProfile(
        attempts_analyzed=len(entries),
        total_questions_analyzed=total_questions,
        average_score=round(sum(scores) / len(scores)) if scores else None,
        recent_trend=recent_trend,
        summary=_profile_summary(len(entries), total_questions, strongest_focuses, weakest_focuses, recent_trend),
        strongest_focuses=strongest_focuses,
        weakest_focuses=weakest_focuses,
        recommended_focuses=recommended_focuses,
        recommendations=_profile_recommendations(weakest_focuses, recent_trend, len(entries)),
    )


def _fallback_review(score: int, results: list[QuestionResult]) -> QuizReview:
    wrong = [item for item in results if not item.is_correct]
    focus_counts = Counter(item.focus for item in wrong)
    improvement_areas = [
        f"{focus.replace('_', ' ')}: sai {count} câu, cần ôn lại theo đúng mẫu lỗi này"
        for focus, count in focus_counts.most_common(3)
    ]
    if not improvement_areas:
        improvement_areas = ["Độ chính xác đang ổn. Hãy tiếp tục ôn lại để phản xạ trở nên tự nhiên hơn."]

    return QuizReview(
        summary=f"Bạn đạt {score}%. Buổi luyện tiếp theo nên bám vào đúng các lỗi vừa sai trong bài này.",
        strengths=["Bạn đã hoàn thành bài quiz và tạo được dữ liệu đo tiến bộ."],
        improvement_areas=improvement_areas,
        next_steps=[
            "Làm lại các câu sai mà chưa nhìn đáp án.",
            "Dùng mỗi đáp án đúng để đặt thêm một câu mới bằng lời nói.",
            "Sau một buổi hội thoại, làm tiếp một quiz ngắn để kiểm tra lại.",
        ],
    )


async def _build_ai_review(
    quiz: Quiz,
    score: int,
    results: list[QuestionResult],
    learner_profile: LearnerQuizProfile,
) -> QuizReview:
    wrong_items = [item.model_dump() for item in results if not item.is_correct]
    prompt = f"""
Hãy nhận xét ngắn gọn kết quả quiz tiếng Anh của người học.

Tên quiz: {quiz.title}
Chủ đề: {quiz.topic}
Trình độ: {quiz.level}
Điểm số: {score}
Các câu sai:
{wrong_items}

Hồ sơ người học từ các bài quiz gần đây:
{learner_profile.model_dump()}

Trả về nhận xét huấn luyện ngắn với:
- summary
- strengths
- improvement_areas
- next_steps
Viết cụ thể, sát lỗi, và phù hợp cho buổi học tiếp theo.
    """
    try:
        llm = get_model(settings.DEFAULT_MODEL, temperature=0.2).with_structured_output(QuizReview)
        review: QuizReview = await llm.ainvoke(
            [
                SystemMessage(content="Bạn là gia sư tiếng Anh đang nhận xét kết quả quiz cho một người học Việt Nam."),
                HumanMessage(content=prompt),
            ]
        )
        return review
    except Exception as exc:
        logger.warning(f"Quiz AI review failed, using fallback review: {exc}")
        return _fallback_review(score, results)


@router.post("/upload-image", response_model=QuizImageUploadResponse)
async def upload_quiz_image(
    file: UploadFile = File(...),
    user: User = Depends(require_role("admin")),
):
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="File ảnh đang trống.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Ảnh quá lớn. Giới hạn hiện tại là 5MB.")

    suffix = ALLOWED_IMAGE_TYPES[content_type]
    safe_name = f"{user.id}-{uuid4().hex}{suffix}"
    target = QUIZ_IMAGE_DIR / safe_name
    target.write_bytes(content)

    return QuizImageUploadResponse(
        url=f"/media/quiz-images/{safe_name}",
        file_name=file.filename or safe_name,
    )


@router.post("", response_model=QuizResponse)
async def create_quiz(req: QuizCreateRequest, user: User = Depends(require_role("admin"))):
    questions = _normalize_questions(req.questions)
    if len(questions) < 1:
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
            questions_json=[item.model_dump() for item in questions],
        )
        db.add(quiz)
        await db.commit()
        await db.refresh(quiz)
        return _quiz_response(quiz)


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz(req: QuizGenerateRequest, user: User = Depends(get_current_user)):
    factory = get_session_factory()
    async with factory() as db:
        if user.role != "admin" and req.source != "mistakes":
            raise HTTPException(status_code=403, detail="Chỉ admin mới được tạo quiz chung từ chủ đề.")

        effective_level = user.cefr_level if user.role == "learner" else req.level

        if req.source == "mistakes":
            generated = await _generate_personalized_remedial_quiz(
                db=db,
                user=user,
                topic=req.topic,
                level=effective_level,
                question_count=req.question_count,
            )
        else:
            focus_text = await _recent_error_focus(db, user.id)
            generated = await _generate_quiz(req, focus_text)

        quiz = Quiz(
            user_id=user.id,
            title=generated.title,
            topic=req.topic,
            level=effective_level,
            source="mistakes" if req.source == "mistakes" else "ai",
            description=generated.description,
            questions_json=[item.model_dump() for item in generated.questions],
        )
        db.add(quiz)
        await db.commit()
        await db.refresh(quiz)
        return _quiz_response(quiz)


def _allowed_levels_for_user(user: User) -> list[str]:
    index = _level_index(user.cefr_level)
    start = max(0, index - MAX_LEARNER_LEVEL_DISTANCE)
    end = min(len(CEFR_LEVELS), index + MAX_LEARNER_LEVEL_DISTANCE + 1)
    return CEFR_LEVELS[start:end]


@router.get("", response_model=list[QuizListItem])
async def list_quizzes(
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    set_id: Optional[str] = Query(default=None),
    user: User = Depends(get_current_user),
):
    factory = get_session_factory()
    async with factory() as db:
        query = (
            select(Quiz)
            .options(selectinload(Quiz.quiz_set))
            .join(User, Quiz.user_id == User.id)
            .where(or_(User.role == "admin", Quiz.user_id == user.id))
            .order_by(desc(Quiz.created_at))
            .limit(limit)
            .offset(offset)
        )
        if set_id:
            query = query.where(Quiz.quiz_set_id == set_id)
        if user.role == "learner":
            query = query.where(Quiz.level.in_(_allowed_levels_for_user(user)))
        result = await db.execute(query)
        quizzes = result.scalars().all()
        items = []
        for quiz in quizzes:
            latest_attempt = None
            if user.role == "learner":
                attempt_result = await db.execute(
                    select(QuizAttempt)
                    .where(QuizAttempt.quiz_id == quiz.id, QuizAttempt.user_id == user.id)
                    .order_by(desc(QuizAttempt.created_at))
                    .limit(1)
                )
                latest_attempt = attempt_result.scalar_one_or_none()
            items.append(_quiz_list_item(quiz, user, latest_attempt))
        return items


@router.post("/import", response_model=QuizImportResponse)
async def import_quizzes(req: QuizImportRequest, user: User = Depends(require_role("admin"))):
    if not req.quizzes:
        raise HTTPException(status_code=422, detail="No quizzes to import")

    imported: list[Quiz] = []
    total_questions = 0
    for item in req.quizzes:
        questions = _normalize_questions(item.questions)
        if not questions:
            continue
        total_questions += len(questions)
        if total_questions > 1000:
            raise HTTPException(status_code=422, detail="Import is limited to 1000 questions per upload")
        imported.append(
            Quiz(
                user_id=user.id,
                title=item.title.strip() or "Imported English quiz",
                topic=item.topic,
                level=item.level,
                source="imported",
                description=item.description,
                questions_json=[question.model_dump() for question in questions],
            )
        )

    if not imported:
        raise HTTPException(status_code=422, detail="No valid questions found in import file")

    factory = get_session_factory()
    async with factory() as db:
        quiz_set = QuizSet(
            created_by=user.id,
            title=f"Bộ đề import - {datetime.utcnow().strftime('%d/%m %H:%M')}",
            description="Bộ đề được import từ file CSV hoặc JSON.",
            source="imported",
            topic=imported[0].topic,
            level=imported[0].level,
        )
        db.add(quiz_set)
        for quiz in imported:
            quiz.quiz_set = quiz_set
            db.add(quiz)
        await db.commit()
        await db.refresh(quiz_set)
        for quiz in imported:
            await db.refresh(quiz)

    items = [_quiz_list_item(quiz, user) for quiz in imported]
    return QuizImportResponse(
        imported_count=len(items),
        question_count=total_questions,
        quizzes=items,
    )


@router.post("/source-import", response_model=QuizSourceImportResponse)
async def import_quizzes_from_source(req: QuizSourceImportRequest, user: User = Depends(require_role("admin"))):
    info = _source_info(req)
    source_text = await _fetch_source_text(info.get("url"))
    generated_items = await _generate_source_quizzes(req, info, source_text)

    imported: list[Quiz] = []
    total_questions = 0
    source_note = f"Nguồn: {info['attribution']}. License: {info['license']}"
    for item in generated_items[: req.quiz_count]:
        questions = _normalize_questions(item.questions)[: req.questions_per_quiz]
        if len(questions) < 3:
            continue
        total_questions += len(questions)
        if total_questions > 1000:
            raise HTTPException(status_code=422, detail="Mỗi lần tạo từ nguồn mở tối đa 1000 câu hỏi.")

        description = (item.description or "").strip()
        if source_note not in description:
            description = f"{description}\n{source_note}".strip()
        imported.append(
            Quiz(
                user_id=user.id,
                title=item.title.strip() or f"{info['title']} - {req.level}",
                topic=item.topic or req.topic,
                level=item.level or req.level,
                source="open_source",
                description=description,
                questions_json=[question.model_dump() for question in questions],
            )
        )

    if not imported:
        raise HTTPException(status_code=422, detail="Không tạo được quiz hợp lệ từ nguồn này.")

    factory = get_session_factory()
    async with factory() as db:
        quiz_set = QuizSet(
            created_by=user.id,
            title=f"{info['title']} - {req.level}",
            description=f"Bộ quiz tạo từ nguồn {info['attribution']}.",
            source="open_source",
            source_preset=req.preset,
            source_title=info["title"],
            source_url=info.get("url"),
            license=info["license"],
            attribution=info["attribution"],
            topic=req.topic,
            level=req.level,
        )
        db.add(quiz_set)
        for quiz in imported:
            quiz.quiz_set = quiz_set
            db.add(quiz)
        await db.commit()
        await db.refresh(quiz_set)
        for quiz in imported:
            await db.refresh(quiz)

    items = [_quiz_list_item(quiz, user) for quiz in imported]
    return QuizSourceImportResponse(
        imported_count=len(items),
        question_count=total_questions,
        quizzes=items,
        source_title=info["title"],
        source_url=info.get("url"),
        license=info["license"],
        attribution=info["attribution"],
    )


@router.post("/source-sets/generate", response_model=QuizSetGenerateResponse)
async def generate_quiz_sets_from_sources(
    req: QuizSourceSetGenerateRequest,
    user: User = Depends(require_role("admin")),
):
    created_sets: list[QuizSet] = []
    created_quizzes: list[Quiz] = []
    total_questions = 0

    factory = get_session_factory()
    async with factory() as db:
        for preset in req.presets:
            if preset == "custom_url":
                raise HTTPException(status_code=422, detail="custom_url cần dùng màn Nguồn mở với URL riêng.")

            source_req = QuizSourceImportRequest(
                preset=preset,
                topic=req.topic,
                level=req.level,
                quiz_count=req.quiz_count_per_set,
                questions_per_quiz=req.questions_per_quiz,
                focus=req.focus,
            )
            info = _source_info(source_req)
            source_text = await _fetch_source_text(info.get("url"))
            generated_items = await _generate_source_quizzes(source_req, info, source_text)
            source_note = f"Nguồn: {info['attribution']}. License: {info['license']}"

            quiz_set = QuizSet(
                created_by=user.id,
                title=f"{info['title']} - {req.level}",
                description=f"Bộ quiz {req.level} theo nguồn {info['attribution']}.",
                source="open_source",
                source_preset=preset,
                source_title=info["title"],
                source_url=info.get("url"),
                license=info["license"],
                attribution=info["attribution"],
                topic=req.topic,
                level=req.level,
            )
            db.add(quiz_set)

            set_quiz_count = 0
            for item in generated_items[: req.quiz_count_per_set]:
                questions = _normalize_questions(item.questions)[: req.questions_per_quiz]
                if len(questions) < 3:
                    continue
                total_questions += len(questions)
                description = (item.description or "").strip()
                if source_note not in description:
                    description = f"{description}\n{source_note}".strip()
                quiz = Quiz(
                    user_id=user.id,
                    quiz_set=quiz_set,
                    title=item.title.strip() or f"{info['title']} - {req.level}",
                    topic=item.topic or req.topic,
                    level=item.level or req.level,
                    source="open_source",
                    description=description,
                    questions_json=[question.model_dump() for question in questions],
                )
                db.add(quiz)
                created_quizzes.append(quiz)
                set_quiz_count += 1

            if set_quiz_count:
                created_sets.append(quiz_set)

        if not created_sets:
            raise HTTPException(status_code=422, detail="Không tạo được bộ quiz hợp lệ từ các nguồn.")

        await db.commit()
        for quiz_set in created_sets:
            await db.refresh(quiz_set)
        for quiz in created_quizzes:
            await db.refresh(quiz)

    set_details = []
    for quiz_set in created_sets:
        quizzes = [_quiz_list_item(quiz, user) for quiz in created_quizzes if quiz.quiz_set_id == quiz_set.id]
        set_details.append(_quiz_set_response(quiz_set, quizzes, user))

    return QuizSetGenerateResponse(
        generated_count=len(set_details),
        quiz_count=len(created_quizzes),
        question_count=total_questions,
        sets=set_details,
    )


@router.post("/curated-sync", response_model=CuratedQuizSyncResponse)
async def sync_curated_open_source_library(
    req: CuratedQuizSyncRequest,
    user: User = Depends(require_role("admin")),
):
    return await _sync_curated_open_source_sets(user=user, replace_existing=req.replace_existing)


@router.get("/sets", response_model=list[QuizSetDetailResponse])
async def list_quiz_sets(
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
):
    factory = get_session_factory()
    async with factory() as db:
        query = (
            select(QuizSet)
            .order_by(desc(QuizSet.created_at))
            .limit(limit)
            .offset(offset)
        )
        if user.role == "learner":
            query = query.where(QuizSet.level.in_(_allowed_levels_for_user(user)))

        result = await db.execute(query)
        quiz_sets = result.scalars().all()
        details: list[QuizSetDetailResponse] = []
        for quiz_set in quiz_sets:
            quiz_result = await db.execute(
                select(Quiz)
                .options(selectinload(Quiz.quiz_set))
                .where(Quiz.quiz_set_id == quiz_set.id)
                .order_by(desc(Quiz.created_at))
            )
            quizzes = quiz_result.scalars().all()
            items = []
            for quiz in quizzes:
                latest_attempt = None
                if user.role == "learner":
                    attempt_result = await db.execute(
                        select(QuizAttempt)
                        .where(QuizAttempt.quiz_id == quiz.id, QuizAttempt.user_id == user.id)
                        .order_by(desc(QuizAttempt.created_at))
                        .limit(1)
                    )
                    latest_attempt = attempt_result.scalar_one_or_none()
                items.append(_quiz_list_item(quiz, user, latest_attempt))
            if items:
                details.append(_quiz_set_response(quiz_set, items, user))
        return details


@router.delete("/{quiz_id}", status_code=204)
async def delete_quiz(quiz_id: str, user: User = Depends(require_role("admin"))):
    del user
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .options(selectinload(Quiz.quiz_set))
            .join(User, Quiz.user_id == User.id)
            .where(Quiz.id == quiz_id, or_(User.role == "admin", Quiz.user_id == user.id))
        )
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        quiz_set_id = quiz.quiz_set_id
        await db.execute(delete(QuizAttempt).where(QuizAttempt.quiz_id == quiz.id))
        await db.delete(quiz)
        if quiz_set_id:
            await db.flush()
            remaining = (
                await db.execute(select(Quiz.id).where(Quiz.quiz_set_id == quiz_set_id).limit(1))
            ).scalar_one_or_none()
            if remaining is None:
                await db.execute(delete(QuizSet).where(QuizSet.id == quiz_set_id))
        await db.commit()
        return Response(status_code=204)


@router.get("/{quiz_id}/admin", response_model=QuizAdminResponse)
async def get_admin_quiz(quiz_id: str, user: User = Depends(require_role("admin"))):
    del user
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .options(selectinload(Quiz.quiz_set))
            .join(User, Quiz.user_id == User.id)
            .where(Quiz.id == quiz_id, or_(User.role == "admin", Quiz.user_id == user.id))
        )
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        return _quiz_admin_response(quiz)


@router.put("/{quiz_id}", response_model=QuizAdminResponse)
async def update_quiz(quiz_id: str, req: QuizUpdateRequest, user: User = Depends(require_role("admin"))):
    del user
    questions = _normalize_questions(req.questions)
    if len(questions) < 1:
        raise HTTPException(status_code=422, detail="At least one question is required")

    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .options(selectinload(Quiz.quiz_set))
            .join(User, Quiz.user_id == User.id)
            .where(Quiz.id == quiz_id, User.role == "admin")
        )
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        quiz.title = req.title.strip() or quiz.title
        quiz.topic = req.topic
        quiz.level = req.level
        quiz.description = req.description
        quiz.questions_json = [question.model_dump() for question in questions]
        await db.commit()
        await db.refresh(quiz)
        return _quiz_admin_response(quiz)


@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(quiz_id: str, user: User = Depends(get_current_user)):
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .options(selectinload(Quiz.quiz_set))
            .join(User, Quiz.user_id == User.id)
            .where(Quiz.id == quiz_id, User.role == "admin")
        )
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        _assert_level_allowed(user, quiz.level)
        return _quiz_response(quiz)


@router.post("/{quiz_id}/submit", response_model=QuizAttemptResponse)
async def submit_quiz(quiz_id: str, req: QuizAnswerSubmit, user: User = Depends(require_role("learner"))):
    await assert_quota_available(user, "quiz")
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .options(selectinload(Quiz.quiz_set))
            .join(User, Quiz.user_id == User.id)
            .where(Quiz.id == quiz_id, User.role == "admin")
        )
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        _assert_level_allowed(user, quiz.level)

        questions = [QuizQuestion.model_validate(item) for item in quiz.questions_json or []]
        score, correct_count, question_results = _score_quiz(questions, req.answers)
        learner_profile = await _build_learner_profile(
            db,
            user.id,
            current_attempt={
                "score": score,
                "total_questions": len(questions),
                "results": question_results,
            },
        )
        review = await _build_ai_review(quiz, score, question_results, learner_profile)

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
            learner_profile=learner_profile,
            created_at=attempt.created_at,
        )


@router.get("/attempts/{attempt_id}", response_model=QuizAttemptResponse)
async def get_quiz_attempt(attempt_id: str, user: User = Depends(require_role("learner"))):
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
        learner_profile = await _build_learner_profile(db, user.id)
        return QuizAttemptResponse(
            id=attempt.id,
            quiz_id=quiz.id,
            quiz_title=quiz.title,
            score=attempt.score,
            correct_count=attempt.correct_count,
            total_questions=attempt.total_questions,
            results=[QuestionResult.model_validate(item) for item in attempt.result_json or []],
            ai_review=QuizReview.model_validate(attempt.ai_review_json or {}),
            learner_profile=learner_profile,
            created_at=attempt.created_at,
        )
