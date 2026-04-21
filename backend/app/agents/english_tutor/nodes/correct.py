"""Correct node — provides explicit but friendly error corrections."""

from datetime import date

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from app.agents.english_tutor.models import EnglishTutorState
from app.agents.english_tutor.prompts import CORRECTION_PROMPT, ENGLISH_TUTOR_PROMPT
from app.agents.english_tutor.session_metrics import normalize_level, summarize_personalization_context
from app.core.llm import get_model
from app.core.settings import settings


def _format_errors(errors: list[dict]) -> str:
    """Format errors for the correction prompt."""
    if not errors:
        return "No specific errors detected."

    lines = []
    # Only correct the top 2 most important errors
    for err in errors[:2]:
        lines.append(
            f"- **{err['error_type']}**: \"{err['original']}\" → \"{err['correction']}\" "
            f"({err.get('explanation', '')})"
        )
    return "\n".join(lines)


def _get_last_user_text(state: EnglishTutorState) -> str:
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            if isinstance(msg.content, str):
                return msg.content
    return ""


def _fallback_correction_response(user_text: str, errors: list[dict], topic: str) -> str:
    topic_display = topic.replace("_", " ")
    if errors:
        focus = errors[0]
        correction = focus.get("correction") or user_text
        explanation = focus.get("explanation") or "That form sounds more natural."
        return (
            f"Thanks for sharing that. A better way to say it is \"{correction}.\" "
            f"{explanation} What else can you say about {topic_display}?"
        )

    return (
        f"Thanks for sharing that. Let's keep practicing {topic_display}. "
        f"Can you add one more detail?"
    )


async def correct_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    """
    Generate a response that naturally includes error corrections.
    Keeps the conversation flowing while teaching.
    """
    metadata = config.get("metadata", {})
    base_level = normalize_level(state.get("user_level") or metadata.get("level"), "B1")
    level = normalize_level(state.get("working_level") or base_level, base_level)
    topic = state.get("current_topic") or metadata.get("topic", "free_conversation")
    errors = state.get("errors_detected", [])
    user_text = _get_last_user_text(state)
    memory_prompt = state.get("memory_prompt") or metadata.get("memory_prompt", "No previous memories.")
    session_context = state.get("session_context") or summarize_personalization_context(
        state.get("session_stats"),
        fallback_level=level,
        current_topic=topic,
    )

    correction_prompt = CORRECTION_PROMPT.format(
        level=level,
        topic=topic,
        errors=_format_errors(errors),
        user_text=user_text,
    )

    # Build context with conversation history
    system_prompt = ENGLISH_TUTOR_PROMPT.format(
        level=level,
        topic=topic,
        date=date.today().isoformat(),
        memory_prompt=memory_prompt,
        session_context=session_context,
    )

    messages = [SystemMessage(content=system_prompt)]
    for msg in state["messages"]:
        if hasattr(msg, "type"):
            messages.append(msg)
    messages.append(HumanMessage(content=correction_prompt))

    llm = get_model(settings.DEFAULT_MODEL, temperature=0.6)
    try:
        response = await llm.ainvoke(messages)
        response_text = response.content
    except Exception as exc:
        logger.warning(f"Correct node fallback triggered: {exc}")
        response_text = _fallback_correction_response(user_text, errors, topic)

    logger.info(f"Correct node generated: {response_text[:100]}...")

    return {
        "messages": [AIMessage(content=response_text)],
        "is_started": True,
    }
