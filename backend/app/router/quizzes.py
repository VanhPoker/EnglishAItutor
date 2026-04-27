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
from sqlalchemy import delete, desc, select

from app.core.auth import get_current_user, require_role
from app.core.llm import get_model
from app.core.settings import settings
from app.core.subscriptions import assert_quota_available
from app.database.connection import get_session_factory
from app.database.models import ErrorLog, Quiz, QuizAttempt, User

router = APIRouter(prefix="/quizzes", tags=["Quizzes"])

QuestionType = Literal["multiple_choice", "fill_blank"]
QuizSource = Literal["ai", "manual", "mistakes", "imported", "open_source"]
QuizSourcePreset = Literal["cefr_core", "wikibooks_grammar", "tatoeba_sentences", "thpt_2025_format", "custom_url"]
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
    question_count: int
    created_at: datetime
    latest_score: Optional[int] = None


class QuizImportResponse(BaseModel):
    imported_count: int
    question_count: int
    quizzes: list[QuizListItem]


class QuizSourceImportResponse(QuizImportResponse):
    source_title: str
    source_url: Optional[str] = None
    license: str
    attribution: str


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


def _quiz_admin_response(quiz: Quiz) -> QuizAdminResponse:
    questions = [QuizQuestion.model_validate(item) for item in quiz.questions_json or []]
    base = _quiz_response(quiz)
    return QuizAdminResponse(**base.model_dump(exclude={"questions"}), questions=questions)


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


def _source_fallback_quizzes(req: QuizSourceImportRequest, info: dict) -> list[QuizImportItem]:
    topic_display = req.topic.replace("_", " ")
    focus = (req.focus or "grammar, vocabulary, reading comprehension").strip()
    templates = [
        QuizQuestion(
            id="q1",
            type="multiple_choice",
            prompt=f"Choose the most natural {req.level} sentence about {topic_display}.",
            options=[
                "I would like to talk about this topic.",
                "I would like talk about this topic.",
                "I like to talking about this topic.",
                "I am like talk about this topic.",
            ],
            correct_answer="I would like to talk about this topic.",
            explanation="Use 'would like to' before the base verb.",
            focus="grammar",
        ),
        QuizQuestion(
            id="q2",
            type="fill_blank",
            prompt="Complete the sentence: This source is useful ___ English practice.",
            correct_answer="for",
            explanation="Use 'useful for' before a noun or gerund phrase.",
            focus="vocabulary",
        ),
        QuizQuestion(
            id="q3",
            type="multiple_choice",
            prompt="Which sentence keeps the meaning clear and polite?",
            options=[
                "Could you explain the answer again?",
                "Explain answer again you?",
                "You can explain answer?",
                "Again the answer explain?",
            ],
            correct_answer="Could you explain the answer again?",
            explanation="This is a polite request form.",
            focus="speaking",
        ),
        QuizQuestion(
            id="q4",
            type="multiple_choice",
            prompt=f"What should a {req.level} learner do after making a mistake?",
            options=[
                "Review the correction and use it in a new sentence.",
                "Ignore the correction completely.",
                "Memorize only the answer letter.",
                "Stop practicing the topic.",
            ],
            correct_answer="Review the correction and use it in a new sentence.",
            explanation="Active reuse helps the learner remember the pattern.",
            focus="comprehension",
        ),
        QuizQuestion(
            id="q5",
            type="fill_blank",
            prompt="Complete: I need more practice ___ this grammar point.",
            correct_answer="with",
            explanation="Use 'practice with' for a skill or topic.",
            focus="word_choice",
        ),
    ]
    quizzes = []
    for index in range(req.quiz_count):
        questions = []
        for q_index in range(1, req.questions_per_quiz + 1):
            question = templates[(q_index - 1) % len(templates)]
            data = question.model_dump()
            data["id"] = f"q{q_index}"
            if q_index > len(templates):
                data["prompt"] = f"{data['prompt']} ({q_index})"
            questions.append(QuizQuestion.model_validate(data))
        quizzes.append(
            QuizImportItem(
                title=f"{info['title']} - {req.level} #{index + 1}",
                topic=req.topic,
                level=req.level,
                description=f"Nguồn: {info['attribution']}. Trọng tâm: {focus}.",
                questions=questions,
            )
        )
    return quizzes


async def _generate_source_quizzes(req: QuizSourceImportRequest, info: dict, source_text: str) -> list[QuizImportItem]:
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

Source excerpt:
{source_text or '(No source excerpt available; use preset guidance only.)'}

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
        if quizzes:
            if len(quizzes) >= req.quiz_count:
                return quizzes[: req.quiz_count]
            fallback = _source_fallback_quizzes(req, info)
            return (quizzes + fallback[len(quizzes):])[: req.quiz_count]
    except Exception as exc:
        logger.warning(f"Source quiz generation failed, using fallback: {exc}")

    return _source_fallback_quizzes(req, info)


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
async def generate_quiz(req: QuizGenerateRequest, user: User = Depends(require_role("admin"))):
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
            .join(User, Quiz.user_id == User.id)
            .where(User.role == "admin")
            .order_by(desc(Quiz.created_at))
            .limit(limit)
            .offset(offset)
        )
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
        for quiz in imported:
            db.add(quiz)
        await db.commit()
        for quiz in imported:
            await db.refresh(quiz)

    items = [
        QuizListItem(
            id=quiz.id,
            title=quiz.title,
            topic=quiz.topic,
            level=quiz.level,
            source=quiz.source,
            question_count=len(quiz.questions_json or []),
            created_at=quiz.created_at,
            latest_score=None,
        )
        for quiz in imported
    ]
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
        for quiz in imported:
            db.add(quiz)
        await db.commit()
        for quiz in imported:
            await db.refresh(quiz)

    items = [
        QuizListItem(
            id=quiz.id,
            title=quiz.title,
            topic=quiz.topic,
            level=quiz.level,
            source=quiz.source,
            question_count=len(quiz.questions_json or []),
            created_at=quiz.created_at,
            latest_score=None,
        )
        for quiz in imported
    ]
    return QuizSourceImportResponse(
        imported_count=len(items),
        question_count=total_questions,
        quizzes=items,
        source_title=info["title"],
        source_url=info.get("url"),
        license=info["license"],
        attribution=info["attribution"],
    )


@router.delete("/{quiz_id}", status_code=204)
async def delete_quiz(quiz_id: str, user: User = Depends(require_role("admin"))):
    del user
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .join(User, Quiz.user_id == User.id)
            .where(Quiz.id == quiz_id, User.role == "admin")
        )
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        await db.execute(delete(QuizAttempt).where(QuizAttempt.quiz_id == quiz.id))
        await db.delete(quiz)
        await db.commit()
        return Response(status_code=204)


@router.get("/{quiz_id}/admin", response_model=QuizAdminResponse)
async def get_admin_quiz(quiz_id: str, user: User = Depends(require_role("admin"))):
    del user
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .join(User, Quiz.user_id == User.id)
            .where(Quiz.id == quiz_id, User.role == "admin")
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
    del user
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .join(User, Quiz.user_id == User.id)
            .where(Quiz.id == quiz_id, User.role == "admin")
        )
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        return _quiz_response(quiz)


@router.post("/{quiz_id}/submit", response_model=QuizAttemptResponse)
async def submit_quiz(quiz_id: str, req: QuizAnswerSubmit, user: User = Depends(require_role("learner"))):
    await assert_quota_available(user, "quiz")
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(
            select(Quiz)
            .join(User, Quiz.user_id == User.id)
            .where(Quiz.id == quiz_id, User.role == "admin")
        )
        quiz = result.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

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
