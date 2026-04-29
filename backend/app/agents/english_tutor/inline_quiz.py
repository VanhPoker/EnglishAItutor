"""Helpers for generating exercise-set widgets inside the chat room."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from langchain_core.messages import HumanMessage

from app.agents.english_tutor.models import EnglishTutorState


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _last_user_text(state: EnglishTutorState) -> str:
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, HumanMessage) and isinstance(msg.content, str):
            return msg.content.strip()
    return ""


def _topic_display(state: EnglishTutorState) -> str:
    topic = _clean(state.get("current_topic")) or "free_conversation"
    return topic.replace("_", " ").strip()


def _choice(choice_id: str, text: str) -> dict[str, str]:
    return {"id": choice_id, "text": text}


def _question(
    *,
    question_id: str,
    prompt: str,
    focus: str,
    choices: list[dict[str, str]],
    correct_choice_id: str,
    explanation: str,
    source_text: str | None = None,
) -> dict[str, Any]:
    return {
        "id": question_id,
        "prompt": prompt,
        "focus": focus,
        "question_type": "multiple_choice",
        "choices": choices,
        "correct_choice_id": correct_choice_id,
        "explanation": explanation,
        "source_text": source_text,
    }


def _error_question(index: int, item: dict[str, Any], source_text: str) -> dict[str, Any] | None:
    original = _clean(item.get("original"))
    correction = _clean(item.get("correction"))
    explanation = _clean(item.get("explanation"))
    focus = (_clean(item.get("error_type")) or "grammar").lower()

    if not original or not correction or original.lower() == correction.lower():
        return None

    return _question(
        question_id=f"q-error-{index}",
        prompt=f"Chọn cách diễn đạt tự nhiên hơn cho phần: “{original}”.",
        focus=focus,
        choices=[
            _choice("correct", correction),
            _choice("original", original),
            _choice("too-short", "I understand, but I need to say it more clearly."),
        ],
        correct_choice_id="correct",
        explanation=explanation or f"Cách diễn đạt tốt hơn là: {correction}",
        source_text=source_text or original,
    )


def _conversation_question(topic: str, level: str, source_text: str) -> dict[str, Any]:
    if level in {"A1", "A2"}:
        choices = [
            _choice("a", "What do you like about it?"),
            _choice("b", "What you like about it?"),
            _choice("c", "What like you about it?"),
            _choice("d", "You like about it what?"),
        ]
        correct = "a"
        explanation = "Câu hỏi cần có trợ động từ 'do': What do you like about it?"
    else:
        choices = [
            _choice("a", f"Could you tell me more about {topic}?"),
            _choice("b", f"Could you tell more about {topic}?"),
            _choice("c", f"Tell me more {topic}?"),
            _choice("d", f"You can tell me more about {topic}?"),
        ]
        correct = "a"
        explanation = "Câu A tự nhiên và lịch sự nhất vì có cấu trúc 'Could you tell me more about...?'"

    return _question(
        question_id="q-follow-up",
        prompt=f"Chọn câu hỏi phù hợp để tiếp tục chủ đề '{topic}'.",
        focus="conversation",
        choices=choices,
        correct_choice_id=correct,
        explanation=explanation,
        source_text=source_text,
    )


def _structure_question(level: str, source_text: str) -> dict[str, Any]:
    if level in {"A1", "A2"}:
        choices = [
            _choice("a", "I went to school yesterday."),
            _choice("b", "I go to school yesterday."),
            _choice("c", "I did went to school yesterday."),
            _choice("d", "I was go to school yesterday."),
        ]
        explanation = "Với 'yesterday', dùng quá khứ đơn: 'went'."
    elif level in {"B1", "B2"}:
        choices = [
            _choice("a", "Could you explain the answer again?"),
            _choice("b", "Explain answer again you?"),
            _choice("c", "Can explain me the answer?"),
            _choice("d", "You explain answer again?"),
        ]
        explanation = "Câu A rõ nghĩa và lịch sự nhất. 'Explain something to someone' hoặc 'explain the answer again'."
    else:
        choices = [
            _choice("a", "I would appreciate it if you could clarify the main point."),
            _choice("b", "I will appreciate if you clarify main point."),
            _choice("c", "I appreciate you clarify the main point."),
            _choice("d", "Clarify main point for appreciate."),
        ]
        explanation = "Câu A dùng cấu trúc lịch sự và tự nhiên: 'I would appreciate it if...'."

    return _question(
        question_id="q-structure",
        prompt="Chọn câu tự nhiên và đúng ngữ pháp nhất.",
        focus="grammar",
        choices=choices,
        correct_choice_id="a",
        explanation=explanation,
        source_text=source_text,
    )


def build_inline_exercise_set(state: EnglishTutorState) -> dict | None:
    """Create a compact exercise set from the current practice session."""
    session_stats = state.get("session_stats") or {}
    source_text = _last_user_text(state)
    topic = _topic_display(state)
    level = _clean(state.get("working_level") or state.get("user_level")) or "B1"
    questions: list[dict[str, Any]] = []

    patterns = sorted(
        (session_stats.get("error_patterns") or {}).values(),
        key=lambda item: (-(int(item.get("count") or 0)), _clean(item.get("correction")).lower()),
    )
    latest_errors = state.get("errors_detected") or []
    source_items = patterns[:2] or latest_errors[:2]

    for index, item in enumerate(source_items, start=1):
        question = _error_question(index, item, source_text)
        if question:
            questions.append(question)

    questions.append(_conversation_question(topic, level, source_text))
    questions.append(_structure_question(level, source_text))

    unique_questions: list[dict[str, Any]] = []
    seen_prompts: set[str] = set()
    for question in questions:
        key = f"{question['prompt'].lower()}::{question.get('correct_choice_id', '')}"
        if key in seen_prompts:
            continue
        seen_prompts.add(key)
        unique_questions.append(question)

    if not unique_questions:
        return None

    return {
        "id": f"inline-exercise-{uuid4()}",
        "type": "exercise_set",
        "title": "Bộ bài tập nhanh trong phiên",
        "description": "Làm vài câu ngắn dựa trên nội dung và lỗi xuất hiện trong phiên luyện nói này.",
        "topic": topic,
        "level": level,
        "questions": unique_questions[:4],
    }
