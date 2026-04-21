"""Respond node — generates natural conversational response."""

from datetime import date

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from app.agents.english_tutor.models import EnglishTutorState
from app.agents.english_tutor.prompts import ENGLISH_TUTOR_PROMPT
from app.agents.english_tutor.session_metrics import normalize_level, summarize_personalization_context
from app.core.llm import get_model
from app.core.settings import settings


def _get_last_user_text(state: EnglishTutorState) -> str:
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage) and isinstance(msg.content, str):
            return msg.content
    return ""


def _fallback_response(state: EnglishTutorState, topic: str) -> str:
    user_text = _get_last_user_text(state)
    errors = state.get("errors_detected", [])
    topic_display = topic.replace("_", " ")

    if errors:
        correction = errors[0].get("correction") or user_text
        return (
            f"That sounds interesting. A more natural way to say it is \"{correction}.\" "
            f"Can you tell me one more thing about {topic_display}?"
        )

    if user_text:
        return (
            f"I understand. Tell me a little more about that. "
            f"What is the most interesting part for you about {topic_display}?"
        )

    return f"Let's keep going with {topic_display}. What would you like to say next?"


async def respond_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    """
    Generate a natural English conversation response.
    Uses recasting technique to gently correct minor errors inline.
    """
    metadata = config.get("metadata", {})
    base_level = normalize_level(state.get("user_level") or metadata.get("level"), "B1")
    level = normalize_level(state.get("working_level") or base_level, base_level)
    topic = state.get("current_topic") or metadata.get("topic", "free_conversation")
    memory_prompt = state.get("memory_prompt") or metadata.get("memory_prompt", "No previous memories.")
    session_context = state.get("session_context") or summarize_personalization_context(
        state.get("session_stats"),
        fallback_level=level,
        current_topic=topic,
    )

    system_prompt = ENGLISH_TUTOR_PROMPT.format(
        level=level,
        topic=topic,
        date=date.today().isoformat(),
        memory_prompt=memory_prompt,
        session_context=session_context,
    )

    # Build message list: system + conversation history
    messages = [SystemMessage(content=system_prompt)]

    # Add greeting if first turn
    if not state.get("is_started"):
        greeting = config.get("metadata", {}).get("greeting_message", "")
        if greeting:
            messages.append(AIMessage(content=greeting))

    # Add conversation history
    for msg in state["messages"]:
        if hasattr(msg, "type"):
            messages.append(msg)

    llm = get_model(settings.DEFAULT_MODEL, temperature=0.7)
    try:
        response = await llm.ainvoke(messages)
        response_text = response.content
    except Exception as exc:
        logger.warning(f"Respond node fallback triggered: {exc}")
        response_text = _fallback_response(state, topic)

    logger.info(f"Respond node generated: {response_text[:100]}...")

    return {
        "messages": [AIMessage(content=response_text)],
        "is_started": True,
    }
