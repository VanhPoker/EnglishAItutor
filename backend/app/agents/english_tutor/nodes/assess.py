"""Assess node - analyzes the learner turn and updates adaptive session state."""

import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from app.agents.english_tutor.models import EnglishTutorState, ErrorAnalysis, RouteDecision
from app.agents.english_tutor.prompts import ERROR_ANALYSIS_PROMPT, ROUTER_PROMPT
from app.agents.english_tutor.session_metrics import ensure_session_stats, normalize_level, update_session_stats
from app.core.llm import get_model
from app.core.settings import settings

_IRREGULAR_VERB_FIXES = {
    "goed": "went",
    "buyed": "bought",
    "eated": "ate",
    "drinked": "drank",
    "runned": "ran",
    "swimmed": "swam",
    "writed": "wrote",
    "sended": "sent",
    "catched": "caught",
    "teached": "taught",
    "thinked": "thought",
    "taked": "took",
}


def _get_last_user_text(state: EnglishTutorState) -> str | None:
    """Extract the last user message text."""
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            if isinstance(msg.content, str):
                return msg.content
            if isinstance(msg.content, list):
                for part in msg.content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        return part["text"]
                    if isinstance(part, str):
                        return part
    return None


def _fallback_error_analysis(user_text: str, fallback_level: str) -> tuple[list[dict], str, str]:
    """Cheap heuristic backup when the LLM provider is unavailable."""
    lowered = user_text.lower()
    errors: list[dict] = []

    for original, correction in _IRREGULAR_VERB_FIXES.items():
        if re.search(rf"\b{re.escape(original)}\b", lowered):
            errors.append(
                {
                    "error_type": "grammar",
                    "original": original,
                    "correction": correction,
                    "explanation": "This verb is irregular in the past tense.",
                }
            )

    pattern_fixes = [
        (
            r"\bit very\b",
            "it was very",
            "grammar",
            "Use a past-form verb like 'was' before the adjective here.",
        ),
        (
            r"\bmany good food\b",
            "a lot of good food",
            "word_choice",
            "Use 'a lot of' with the uncountable noun 'food'.",
        ),
        (
            r"\bi am agree\b",
            "I agree",
            "grammar",
            "Say 'I agree' without 'am'.",
        ),
    ]
    for pattern, correction, error_type, explanation in pattern_fixes:
        match = re.search(pattern, lowered)
        if match:
            errors.append(
                {
                    "error_type": error_type,
                    "original": match.group(0),
                    "correction": correction,
                    "explanation": explanation,
                }
            )

    overall_quality = "good"
    if len(errors) == 1:
        overall_quality = "fair"
    elif len(errors) >= 2:
        overall_quality = "needs_work"

    return errors[:3], overall_quality, fallback_level


async def assess_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    """
    Analyze user's English and decide how to route the conversation.

    1. Run error analysis on user's text
    2. Decide routing: respond / correct / topic_change
    """
    user_text = _get_last_user_text(state)
    if not user_text:
        return {"errors_detected": [], "should_correct": False, "route": "respond"}

    metadata = config.get("metadata", {})
    base_level = normalize_level(state.get("user_level") or metadata.get("level"), "B1")
    working_level = normalize_level(state.get("working_level") or base_level, base_level)
    topic = state.get("current_topic") or metadata.get("topic", "free_conversation")
    user_id = state.get("user_id") or metadata.get("user_id", "anonymous")
    mem0_user_id = state.get("mem0_user_id") or user_id
    session_stats = ensure_session_stats(state.get("session_stats"), base_level)

    llm = get_model(settings.DEFAULT_MODEL, temperature=0.3)

    # ── Step 1: Error analysis ──
    errors_detected = []
    overall_quality = "good"
    suggested_level = working_level
    try:
        analysis_llm = llm.with_structured_output(ErrorAnalysis)
        analysis_prompt = ERROR_ANALYSIS_PROMPT.format(level=working_level, user_text=user_text)
        analysis: ErrorAnalysis = await analysis_llm.ainvoke([
            SystemMessage(content="You are an English language error analyzer."),
            HumanMessage(content=analysis_prompt),
        ])
        errors_detected = [e.model_dump() for e in analysis.errors]
        overall_quality = analysis.overall_quality
        suggested_level = analysis.suggested_level
        logger.info(
            "Errors detected: {}, quality: {}, suggested_level: {}",
            len(errors_detected),
            overall_quality,
            suggested_level,
        )
    except Exception as e:
        logger.warning(f"Error analysis failed, proceeding without: {e}")
        errors_detected, overall_quality, suggested_level = _fallback_error_analysis(user_text, working_level)

    # ── Step 2: Routing decision ──
    turns_since_correction = session_stats.get("turns_since_correction", 0)
    error_count = len(errors_detected)

    # Fast-path routing (no LLM needed)
    if error_count == 0 and turns_since_correction < 10:
        route = "respond"
    elif error_count >= 2 and turns_since_correction >= 3:
        route = "correct"
    elif session_stats.get("turns", 0) > 12 and turns_since_correction > 5:
        route = "topic_change"
    else:
        # Use LLM for ambiguous cases
        try:
            router_llm = llm.with_structured_output(RouteDecision)
            router_prompt = ROUTER_PROMPT.format(
                user_text=user_text,
                topic=topic,
                error_count=error_count,
                turns_since_correction=turns_since_correction,
            )
            decision: RouteDecision = await router_llm.ainvoke([
                SystemMessage(content="You are a conversation router."),
                HumanMessage(content=router_prompt),
            ])
            route = decision.route
            logger.info(f"Route decision: {route} — {decision.reasoning}")
        except Exception as e:
            logger.warning(f"Router LLM failed, defaulting to respond: {e}")
            route = "respond"

    new_stats = update_session_stats(
        session_stats,
        fallback_level=base_level,
        topic=topic,
        route=route,
        errors=errors_detected,
        overall_quality=overall_quality,
        suggested_level=suggested_level,
        user_text=user_text,
    )

    return {
        "user_id": user_id,
        "user_level": base_level,
        "working_level": new_stats["working_level"],
        "current_topic": topic,
        "mem0_user_id": mem0_user_id,
        "errors_detected": errors_detected,
        "should_correct": route == "correct",
        "route": route,
        "overall_quality": overall_quality,
        "suggested_level": normalize_level(suggested_level, working_level),
        "session_stats": new_stats,
    }
