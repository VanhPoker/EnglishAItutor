"""Assess node — analyzes user's English for errors and decides routing."""

from datetime import date

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from app.agents.english_tutor.models import EnglishTutorState, ErrorAnalysis, RouteDecision
from app.agents.english_tutor.prompts import ERROR_ANALYSIS_PROMPT, ROUTER_PROMPT
from app.core.llm import get_model
from app.core.settings import settings


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


async def assess_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    """
    Analyze user's English and decide how to route the conversation.

    1. Run error analysis on user's text
    2. Decide routing: respond / correct / topic_change
    """
    user_text = _get_last_user_text(state)
    if not user_text:
        return {"errors_detected": [], "should_correct": False, "route": "respond"}

    level = state.get("user_level", "B1")
    topic = state.get("current_topic", "free_conversation")
    session_stats = state.get("session_stats", {})

    llm = get_model(settings.DEFAULT_MODEL, temperature=0.3)

    # ── Step 1: Error analysis ──
    errors_detected = []
    try:
        analysis_llm = llm.with_structured_output(ErrorAnalysis)
        analysis_prompt = ERROR_ANALYSIS_PROMPT.format(level=level, user_text=user_text)
        analysis: ErrorAnalysis = await analysis_llm.ainvoke([
            SystemMessage(content="You are an English language error analyzer."),
            HumanMessage(content=analysis_prompt),
        ])
        errors_detected = [e.model_dump() for e in analysis.errors]
        logger.info(f"Errors detected: {len(errors_detected)}, quality: {analysis.overall_quality}")
    except Exception as e:
        logger.warning(f"Error analysis failed, proceeding without: {e}")

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

    # Update session stats
    new_stats = {**session_stats}
    new_stats["turns"] = new_stats.get("turns", 0) + 1
    new_stats["total_errors"] = new_stats.get("total_errors", 0) + error_count
    if route == "correct":
        new_stats["corrections"] = new_stats.get("corrections", 0) + 1
        new_stats["turns_since_correction"] = 0
    else:
        new_stats["turns_since_correction"] = turns_since_correction + 1

    return {
        "errors_detected": errors_detected,
        "should_correct": route == "correct",
        "route": route,
        "session_stats": new_stats,
    }
