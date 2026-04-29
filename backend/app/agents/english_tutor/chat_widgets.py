"""Chat-native learning widgets for the English tutor room."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.agents.english_tutor.models import EnglishTutorState
from app.agents.english_tutor.session_metrics import compute_session_scores, top_error_patterns


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _topic_label(topic: str | None) -> str:
    return _clean(topic).replace("_", " ") or "free conversation"


def _quality_label(value: str | None) -> str:
    labels = {
        "excellent": "Rất tốt",
        "good": "Ổn",
        "fair": "Cần chắc hơn",
        "needs_work": "Cần ôn lại",
    }
    return labels.get(_clean(value).lower(), "Ổn")


def _mistake_items(patterns: list[dict[str, Any]], limit: int = 3) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for item in patterns[:limit]:
        original = _clean(item.get("original"))
        correction = _clean(item.get("correction"))
        if not original or not correction:
            continue
        items.append(
            {
                "error_type": _clean(item.get("error_type")) or "grammar",
                "original": original,
                "correction": correction,
                "explanation": _clean(item.get("explanation")),
                "count": int(item.get("count") or 1),
            }
        )
    return items


def build_session_recap_widget(state: EnglishTutorState, fallback_level: str = "B1") -> dict | None:
    session_stats = state.get("session_stats") or {}
    turns = int(session_stats.get("turns") or 0)
    if turns <= 0:
        return None

    topic = _topic_label(state.get("current_topic"))
    working_level = _clean(state.get("working_level") or state.get("user_level") or fallback_level)
    scorecard = compute_session_scores(session_stats, working_level)
    last_turn = session_stats.get("last_turn") or {}
    patterns = top_error_patterns(session_stats, limit=3)
    mistakes = _mistake_items(patterns, limit=3)

    highlights = [
        f"Bạn đã có {turns} lượt nói/nhắn trong phiên này.",
        f"Chủ đề chính: {topic}.",
        f"Chất lượng câu gần nhất: {_quality_label(last_turn.get('quality'))}.",
    ]
    if mistakes:
        highlights.append("Nên ưu tiên sửa các lỗi xuất hiện trong sổ lỗi bên dưới trước khi đổi chủ đề.")
    else:
        highlights.append("Chưa thấy lỗi lặp lại rõ ràng; có thể tiếp tục nói dài hơn để hệ thống bắt lỗi tốt hơn.")

    return {
        "id": f"session-recap-{uuid4()}",
        "type": "session_recap",
        "title": "Tổng kết nhanh phiên luyện",
        "description": "Một checkpoint nhỏ để bạn biết mình đang luyện gì và nên sửa điểm nào ngay trong chat.",
        "badge": working_level,
        "metrics": [
            {"label": "Lượt trong phiên", "value": str(turns), "tone": "neutral"},
            {"label": "Grammar", "value": str(scorecard["grammar_score"]), "tone": "good"},
            {"label": "Từ vựng", "value": str(scorecard["vocabulary_score"]), "tone": "good"},
        ],
        "highlights": highlights,
        "mistakes": mistakes,
        "actions": [
            {"label": "Làm bài ôn lỗi", "to": "/quizzes", "variant": "primary"},
            {"label": "Xem tiến độ", "to": "/review", "variant": "secondary"},
        ],
    }


def build_mistake_notebook_widget(state: EnglishTutorState) -> dict | None:
    session_stats = state.get("session_stats") or {}
    patterns = top_error_patterns(session_stats, limit=5)
    mistakes = _mistake_items(patterns, limit=5)
    if not mistakes:
        last_turn = session_stats.get("last_turn") or {}
        user_text = _clean(last_turn.get("user_text"))
        return {
            "id": f"mistake-notebook-{uuid4()}",
            "type": "mistake_notebook",
            "title": "Chưa đủ lỗi để lập sổ lỗi",
            "description": "Hãy nói hoặc nhắn thêm vài câu dài hơn. Khi hệ thống thấy lỗi lặp lại, sổ lỗi sẽ tự rõ hơn.",
            "badge": "Đang thu thập",
            "highlights": [
                "Nói thành câu hoàn chỉnh sẽ giúp AI bắt lỗi chính xác hơn.",
                f"Câu gần nhất: {user_text}" if user_text else "Bạn có thể bắt đầu bằng một câu 8-12 từ.",
            ],
            "actions": [
                {"label": "Làm quiz luyện nền", "to": "/quizzes", "variant": "primary"},
            ],
        }

    return {
        "id": f"mistake-notebook-{uuid4()}",
        "type": "mistake_notebook",
        "title": "Sổ lỗi trong phiên",
        "description": "Các mẫu lỗi này được lấy từ chính câu bạn vừa nói/nhắn, dùng để ôn ngay thay vì học lan man.",
        "badge": f"{len(mistakes)} lỗi cần chú ý",
        "mistakes": mistakes,
        "highlights": [
            "Đọc lại từng cặp sai → đúng, rồi dùng phiên bản đúng trong câu tiếp theo.",
            "Nếu muốn luyện sâu, nhắn “cho tôi làm bài lỗi này” để mở bộ bài tập ngay trong chat.",
        ],
        "actions": [
            {"label": "Mở kho ôn lỗi", "to": "/quizzes", "variant": "primary"},
            {"label": "Xem review", "to": "/review", "variant": "secondary"},
        ],
    }
