"""Topic node — suggests a new conversation topic when needed."""

from datetime import date

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables.config import RunnableConfig
from loguru import logger

from app.agents.english_tutor.models import EnglishTutorState, TopicSuggestion
from app.agents.english_tutor.prompts import TOPIC_PROMPT
from app.agents.english_tutor.session_metrics import normalize_level, summarize_personalization_context
from app.core.llm import get_model
from app.core.settings import settings


async def topic_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    """
    Generate a topic change with an engaging transition.
    """
    metadata = config.get("metadata", {})
    base_level = normalize_level(state.get("user_level") or metadata.get("level"), "B1")
    level = normalize_level(state.get("working_level") or base_level, base_level)
    previous_topic = state.get("current_topic") or metadata.get("topic", "free_conversation")
    session_stats = state.get("session_stats", {})
    memory_prompt = state.get("memory_prompt") or metadata.get("memory_prompt", "No previous memories.")
    session_context = state.get("session_context") or summarize_personalization_context(
        session_stats,
        fallback_level=level,
        current_topic=previous_topic,
    )

    session_summary = (
        f"Turns: {session_stats.get('turns', 0)}, "
        f"Errors: {session_stats.get('total_errors', 0)}, "
        f"Corrections given: {session_stats.get('corrections', 0)}"
    )

    llm = get_model(settings.DEFAULT_MODEL, temperature=0.8)

    # Get topic suggestion
    try:
        topic_llm = llm.with_structured_output(TopicSuggestion)
        topic_prompt = TOPIC_PROMPT.format(
            level=level,
            previous_topic=previous_topic,
            session_summary=session_summary,
            memory_prompt=memory_prompt,
            session_context=session_context,
        )
        suggestion: TopicSuggestion = await topic_llm.ainvoke([
            SystemMessage(content="You are a creative English conversation topic planner."),
            HumanMessage(content=topic_prompt),
        ])
        new_topic = suggestion.topic
        opening = suggestion.opening_question
        logger.info(f"Topic change: {previous_topic} → {new_topic}")
    except Exception as e:
        logger.warning(f"Topic suggestion failed, using fallback: {e}")
        new_topic = "daily_life"
        opening = "Let's talk about something different! What did you do today?"

    # Generate a smooth transition message
    transition = f"That was a great conversation about {previous_topic.replace('_', ' ')}! {opening}"

    return {
        "messages": [AIMessage(content=transition)],
        "current_topic": new_topic,
        "is_started": True,
    }
