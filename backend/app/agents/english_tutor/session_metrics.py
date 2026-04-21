"""Helpers for adaptive tutoring state, scoring, and personalization."""

from __future__ import annotations

from typing import Any

CEFR_LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
QUALITY_SCORES = {
    "excellent": 96,
    "good": 84,
    "fair": 68,
    "needs_work": 52,
}
QUALITY_WEIGHTS = {
    "excellent": 1.2,
    "good": 1.0,
    "fair": 0.85,
    "needs_work": 0.7,
}
ERROR_TYPES = ("grammar", "vocabulary", "word_choice", "pronunciation")


def normalize_level(level: str | None, default: str = "B1") -> str:
    normalized = (level or "").upper().strip()
    if normalized in CEFR_LEVELS:
        return normalized
    return default if default in CEFR_LEVELS else "B1"


def normalize_quality(quality: str | None) -> str:
    normalized = (quality or "").strip().lower()
    if normalized in QUALITY_SCORES:
        return normalized
    return "good"


def _baseline_level(fallback_level: str) -> dict[str, Any]:
    level = normalize_level(fallback_level)
    return {
        "initial_level": level,
        "working_level": level,
        "turns": 0,
        "total_errors": 0,
        "corrections": 0,
        "turns_since_correction": 0,
        "quality_counts": {name: 0 for name in QUALITY_SCORES},
        "quality_history": [],
        "quality_scores": [],
        "suggested_level_history": [],
        "error_type_counts": {name: 0 for name in ERROR_TYPES},
        "error_patterns": {},
        "route_counts": {"respond": 0, "correct": 0, "topic_change": 0},
        "topic_history": [],
        "last_turn": {},
    }


def ensure_session_stats(session_stats: dict[str, Any] | None, fallback_level: str) -> dict[str, Any]:
    baseline = _baseline_level(fallback_level)
    if not session_stats:
        return baseline

    merged = {**baseline, **session_stats}
    merged["initial_level"] = normalize_level(merged.get("initial_level"), baseline["initial_level"])
    merged["working_level"] = normalize_level(
        merged.get("working_level"),
        merged["initial_level"],
    )
    merged["quality_counts"] = {**baseline["quality_counts"], **(merged.get("quality_counts") or {})}
    merged["error_type_counts"] = {**baseline["error_type_counts"], **(merged.get("error_type_counts") or {})}
    merged["route_counts"] = {**baseline["route_counts"], **(merged.get("route_counts") or {})}
    merged["quality_history"] = list(merged.get("quality_history") or [])
    merged["quality_scores"] = list(merged.get("quality_scores") or [])
    merged["suggested_level_history"] = [
        normalize_level(level, merged["initial_level"])
        for level in (merged.get("suggested_level_history") or [])
    ]
    merged["topic_history"] = list(merged.get("topic_history") or [])
    merged["error_patterns"] = dict(merged.get("error_patterns") or {})
    merged["last_turn"] = dict(merged.get("last_turn") or {})
    return merged


def _clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def _level_index(level: str) -> int:
    return CEFR_LEVELS.index(normalize_level(level))


def _quality_average(stats: dict[str, Any]) -> float:
    scores = stats.get("quality_scores") or []
    if not scores:
        return float(QUALITY_SCORES["good"])
    return sum(scores) / len(scores)


def _dominant_level(levels: list[str], fallback_level: str) -> tuple[str, float]:
    if not levels:
        return normalize_level(fallback_level), 0.0
    counts: dict[str, int] = {}
    for level in levels:
        counts[level] = counts.get(level, 0) + 1
    dominant_level, dominant_count = max(counts.items(), key=lambda item: item[1])
    return dominant_level, dominant_count / len(levels)


def derive_working_level(stats: dict[str, Any], fallback_level: str) -> str:
    baseline_level = normalize_level(stats.get("initial_level"), fallback_level)
    history = stats.get("suggested_level_history") or []
    qualities = stats.get("quality_history") or []
    if len(history) < 3:
        return baseline_level

    baseline_idx = _level_index(baseline_level)
    weighted_total = baseline_idx * 2.5
    weight_sum = 2.5
    for index, level in enumerate(history):
        quality = qualities[index] if index < len(qualities) else "good"
        weight = QUALITY_WEIGHTS.get(normalize_quality(quality), 1.0)
        weighted_total += _level_index(level) * weight
        weight_sum += weight

    candidate_idx = round(weighted_total / weight_sum)
    if candidate_idx > baseline_idx + 1:
        candidate_idx = baseline_idx + 1
    if candidate_idx < baseline_idx - 1:
        candidate_idx = baseline_idx - 1
    candidate_idx = max(0, min(candidate_idx, len(CEFR_LEVELS) - 1))
    return CEFR_LEVELS[candidate_idx]


def _update_error_patterns(stats: dict[str, Any], errors: list[dict]) -> None:
    patterns = stats.get("error_patterns") or {}
    for err in errors:
        error_type = (err.get("error_type") or "grammar").strip().lower()
        original = (err.get("original") or "").strip()
        correction = (err.get("correction") or "").strip()
        key = f"{error_type}|{original.lower()}|{correction.lower()}"
        item = patterns.get(
            key,
            {
                "error_type": error_type,
                "original": original,
                "correction": correction,
                "explanation": (err.get("explanation") or "").strip(),
                "count": 0,
            },
        )
        item["count"] += 1
        if err.get("explanation"):
            item["explanation"] = err["explanation"].strip()
        patterns[key] = item

    ranked = sorted(
        patterns.items(),
        key=lambda item: (
            -(item[1].get("count") or 0),
            item[1].get("error_type") or "",
            item[1].get("correction") or "",
        ),
    )[:50]
    stats["error_patterns"] = {key: value for key, value in ranked}


def update_session_stats(
    session_stats: dict[str, Any] | None,
    *,
    fallback_level: str,
    topic: str,
    route: str,
    errors: list[dict],
    overall_quality: str,
    suggested_level: str,
    user_text: str,
) -> dict[str, Any]:
    stats = ensure_session_stats(session_stats, fallback_level)

    quality = normalize_quality(overall_quality)
    level = normalize_level(suggested_level, stats["working_level"])
    turns_since_correction = int(stats.get("turns_since_correction") or 0)
    turn_number = int(stats.get("turns") or 0) + 1

    stats["turns"] = turn_number
    stats["total_errors"] = int(stats.get("total_errors") or 0) + len(errors)
    stats["quality_counts"][quality] += 1
    stats["quality_history"].append(quality)
    stats["quality_scores"].append(QUALITY_SCORES[quality])
    stats["suggested_level_history"].append(level)
    stats["route_counts"][route] = int(stats["route_counts"].get(route) or 0) + 1

    if route == "correct":
        stats["corrections"] = int(stats.get("corrections") or 0) + 1
        stats["turns_since_correction"] = 0
    else:
        stats["turns_since_correction"] = turns_since_correction + 1

    if not stats["topic_history"] or stats["topic_history"][-1] != topic:
        stats["topic_history"].append(topic)
        stats["topic_history"] = stats["topic_history"][-8:]

    for err in errors:
        error_type = (err.get("error_type") or "grammar").strip().lower()
        if error_type not in stats["error_type_counts"]:
            stats["error_type_counts"][error_type] = 0
        stats["error_type_counts"][error_type] += 1

    _update_error_patterns(stats, errors)
    stats["working_level"] = derive_working_level(stats, stats["initial_level"])
    stats["last_turn"] = {
        "turn": turn_number,
        "route": route,
        "topic": topic,
        "quality": quality,
        "suggested_level": level,
        "error_count": len(errors),
        "user_text": user_text[:240],
        "error_types": sorted({(err.get("error_type") or "grammar").strip().lower() for err in errors}),
    }
    return stats


def summarize_personalization_context(
    session_stats: dict[str, Any] | None,
    *,
    fallback_level: str,
    current_topic: str,
) -> str:
    stats = ensure_session_stats(session_stats, fallback_level)
    working_level = derive_working_level(stats, fallback_level)
    last_turn = stats.get("last_turn") or {}

    quality_history = stats.get("quality_history") or []
    quality_trend = " -> ".join(quality_history[-3:]) if quality_history else "no evidence yet"

    recurring_patterns = top_error_patterns(stats, limit=3)
    if recurring_patterns:
        recurring_text = "; ".join(
            f"{item['error_type']}: {item['original']} -> {item['correction']} ({item['count']}x)"
            for item in recurring_patterns
        )
    else:
        recurring_text = "no recurring issue identified yet"

    return "\n".join(
        [
            f"- Working CEFR level for this turn: {working_level}",
            f"- Current topic focus: {current_topic.replace('_', ' ')}",
            f"- Session trend: {stats.get('turns', 0)} learner turns, quality trend {quality_trend}",
            f"- Recurring correction focus: {recurring_text}",
            f"- Latest learner message quality: {last_turn.get('quality', 'good')}",
        ]
    )


def top_error_patterns(session_stats: dict[str, Any] | None, limit: int = 5) -> list[dict[str, Any]]:
    stats = ensure_session_stats(session_stats, "B1")
    ranked = sorted(
        (stats.get("error_patterns") or {}).values(),
        key=lambda item: (
            -(item.get("count") or 0),
            item.get("error_type") or "",
            item.get("correction") or "",
        ),
    )
    return ranked[:limit]


def compute_session_scores(session_stats: dict[str, Any] | None, fallback_level: str) -> dict[str, Any]:
    stats = ensure_session_stats(session_stats, fallback_level)
    turns = max(int(stats.get("turns") or 0), 1)
    total_errors = int(stats.get("total_errors") or 0)
    corrections = int(stats.get("corrections") or 0)
    error_counts = stats.get("error_type_counts") or {}

    quality_avg = _quality_average(stats)
    grammar_rate = (error_counts.get("grammar") or 0) / turns
    vocabulary_rate = (error_counts.get("vocabulary") or 0) / turns
    word_choice_rate = (error_counts.get("word_choice") or 0) / turns
    pronunciation_rate = (error_counts.get("pronunciation") or 0) / turns
    total_error_rate = total_errors / turns
    correction_ratio = corrections / turns

    grammar_score = _clamp_score(
        quality_avg * 0.58 + (100 - min(100, grammar_rate * 28 + total_error_rate * 14)) * 0.42
    )
    vocabulary_score = _clamp_score(
        quality_avg * 0.54
        + (100 - min(100, vocabulary_rate * 26 + word_choice_rate * 20 + total_error_rate * 12)) * 0.46
    )
    fluency_score = _clamp_score(
        quality_avg * 0.5
        + (100 - min(100, pronunciation_rate * 24 + correction_ratio * 18 + total_error_rate * 10)) * 0.5
    )

    recommended_level = derive_working_level(stats, fallback_level)
    dominant_level, level_confidence = _dominant_level(
        stats.get("suggested_level_history") or [],
        fallback_level,
    )

    return {
        "grammar_score": grammar_score,
        "vocabulary_score": vocabulary_score,
        "fluency_score": fluency_score,
        "recommended_level": recommended_level,
        "dominant_level": dominant_level,
        "level_confidence": round(level_confidence, 2),
        "quality_average": round(quality_avg, 1),
        "turns": int(stats.get("turns") or 0),
    }


def recommended_profile_level(session_stats: dict[str, Any] | None, fallback_level: str) -> str | None:
    stats = ensure_session_stats(session_stats, fallback_level)
    metrics = compute_session_scores(stats, fallback_level)
    turns = metrics["turns"]
    candidate = normalize_level(metrics["recommended_level"], fallback_level)
    baseline = normalize_level(stats.get("initial_level"), fallback_level)

    if turns < 6 or candidate == baseline:
        return None

    confidence = metrics["level_confidence"]
    quality_average = metrics["quality_average"]
    baseline_idx = _level_index(baseline)
    candidate_idx = _level_index(candidate)
    if abs(candidate_idx - baseline_idx) > 1:
        candidate_idx = baseline_idx + (1 if candidate_idx > baseline_idx else -1)
        candidate = CEFR_LEVELS[candidate_idx]

    if confidence < 0.58:
        return None
    if candidate_idx > baseline_idx and quality_average < 70:
        return None
    if candidate_idx < baseline_idx and quality_average > 90:
        return None
    return candidate


def build_stats_payload(session_stats: dict[str, Any] | None, fallback_level: str) -> dict[str, Any]:
    stats = ensure_session_stats(session_stats, fallback_level)
    metrics = compute_session_scores(stats, fallback_level)
    return {
        "working_level": derive_working_level(stats, fallback_level),
        "recommended_profile_level": recommended_profile_level(stats, fallback_level),
        "level_confidence": metrics["level_confidence"],
        "quality_average": metrics["quality_average"],
        "quality_counts": stats.get("quality_counts") or {},
        "route_counts": stats.get("route_counts") or {},
        "error_type_counts": stats.get("error_type_counts") or {},
        "topics_seen": stats.get("topic_history") or [],
        "top_error_patterns": top_error_patterns(stats, limit=5),
        "last_turn": stats.get("last_turn") or {},
    }
