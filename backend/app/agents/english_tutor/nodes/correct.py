"""Correct node — provides explicit but friendly error corrections."""

from datetime import date

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from app.agents.english_tutor.models import EnglishTutorState
from app.agents.english_tutor.prompts import CORRECTION_PROMPT, ENGLISH_TUTOR_PROMPT
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


async def correct_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    """
    Generate a response that naturally includes error corrections.
    Keeps the conversation flowing while teaching.
    """
    level = state.get("user_level", "B1")
    topic = state.get("current_topic", "free_conversation")
    errors = state.get("errors_detected", [])
    user_text = _get_last_user_text(state)
    memory_prompt = config.get("metadata", {}).get("memory_prompt", "No previous memories.")

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
    )

    messages = [SystemMessage(content=system_prompt)]
    for msg in state["messages"]:
        if hasattr(msg, "type"):
            messages.append(msg)
    messages.append(HumanMessage(content=correction_prompt))

    llm = get_model(settings.DEFAULT_MODEL, temperature=0.6)
    response = await llm.ainvoke(messages)

    logger.info(f"Correct node generated: {response.content[:100]}...")

    return {
        "messages": [AIMessage(content=response.content)],
        "is_started": True,
    }
