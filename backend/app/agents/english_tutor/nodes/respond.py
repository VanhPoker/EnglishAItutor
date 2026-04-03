"""Respond node — generates natural conversational response."""

from datetime import date

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from app.agents.english_tutor.models import EnglishTutorState
from app.agents.english_tutor.prompts import ENGLISH_TUTOR_PROMPT
from app.core.llm import get_model
from app.core.settings import settings


async def respond_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    """
    Generate a natural English conversation response.
    Uses recasting technique to gently correct minor errors inline.
    """
    level = state.get("user_level", "B1")
    topic = state.get("current_topic", "free_conversation")
    memory_prompt = config.get("metadata", {}).get("memory_prompt", "No previous memories.")

    system_prompt = ENGLISH_TUTOR_PROMPT.format(
        level=level,
        topic=topic,
        date=date.today().isoformat(),
        memory_prompt=memory_prompt,
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
    response = await llm.ainvoke(messages)

    logger.info(f"Respond node generated: {response.content[:100]}...")

    return {
        "messages": [AIMessage(content=response.content)],
        "is_started": True,
    }
