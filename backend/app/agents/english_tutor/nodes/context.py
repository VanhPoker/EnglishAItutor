"""Context refresh node - loads fresh memory and adaptive tutoring context."""

from __future__ import annotations

from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from app.agents.english_tutor.models import EnglishTutorState
from app.agents.english_tutor.session_metrics import (
    derive_working_level,
    summarize_personalization_context,
)
from app.memory.client import format_memory_search_results


async def prepare_context_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    """Refresh long-term memory context for the latest learner turn."""
    metadata = config.get("metadata", {})
    memory_client = metadata.get("memory_client")
    fallback_memory = metadata.get("memory_prompt", "No previous memories about this learner.")

    user_id = state.get("mem0_user_id") or state.get("user_id") or metadata.get("user_id", "anonymous")
    current_topic = state.get("current_topic") or metadata.get("topic", "free_conversation")
    fallback_level = state.get("user_level") or metadata.get("level", "B1")
    session_stats = state.get("session_stats", {})
    working_level = derive_working_level(session_stats, fallback_level)
    last_turn = (session_stats or {}).get("last_turn", {})
    latest_text = last_turn.get("user_text", "")
    latest_errors = ", ".join(last_turn.get("error_types") or []) or "none"

    memory_prompt = state.get("memory_prompt") or fallback_memory
    if memory_client and user_id and user_id != "anonymous":
        try:
            query = (
                "English learner profile. "
                f"Topic: {current_topic}. "
                f"Working level: {working_level}. "
                f"Latest message: {latest_text or 'n/a'}. "
                f"Current error focus: {latest_errors}."
            )
            results = await memory_client.search(query, user_id=user_id)
            memory_prompt = format_memory_search_results(
                results,
                limit=5,
                fallback=memory_prompt,
            )
        except Exception as exc:
            logger.warning(f"Context memory refresh failed: {exc}")

    session_context = summarize_personalization_context(
        session_stats,
        fallback_level=fallback_level,
        current_topic=current_topic,
    )

    return {
        "memory_prompt": memory_prompt,
        "session_context": session_context,
        "working_level": working_level,
    }
