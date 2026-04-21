"""
LangGraph state machine for the English Tutor agent.

Flow:
  User Input -> assess -> prepare_context -> [route] -> respond / correct / topic_change -> save_memory -> Output
"""

import asyncio

from langchain_core.messages import HumanMessage
from langchain_core.runnables.config import RunnableConfig
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, StateGraph
from loguru import logger

from app.agents.english_tutor.models import EnglishTutorState
from app.agents.english_tutor.nodes.assess import assess_node
from app.agents.english_tutor.nodes.context import prepare_context_node
from app.agents.english_tutor.nodes.correct import correct_node
from app.agents.english_tutor.nodes.respond import respond_node
from app.agents.english_tutor.nodes.topic import topic_node
from app.database.connection import get_connection_pool


# ── Memory save node ─────────────────────────────────────────────

async def save_memory_node(state: EnglishTutorState, config: RunnableConfig) -> dict:
    """
    Save conversation insights to mem0 for long-term memory.
    Runs asynchronously — doesn't block the response.
    """
    metadata = config.get("metadata", {})
    memory_client = metadata.get("memory_client")
    mem0_user_id = state.get("mem0_user_id", state.get("user_id") or metadata.get("user_id", "anonymous"))

    if not memory_client:
        return {}

    # Get the last exchange (user + assistant)
    messages = state.get("messages", [])
    if len(messages) < 2:
        return {}

    last_messages = messages[-4:]  # Last 2 exchanges
    chat_text = ""
    for msg in last_messages:
        role = "User" if isinstance(msg, HumanMessage) else "Assistant"
        content = msg.content if isinstance(msg.content, str) else str(msg.content)
        chat_text += f"{role}: {content}\n"

    # Fire and forget — don't block the response
    async def _save():
        try:
            await memory_client.add(chat_text, user_id=mem0_user_id)
            logger.info(f"Memory saved for user {mem0_user_id}")
        except Exception as e:
            logger.warning(f"Memory save failed: {e}")

    asyncio.create_task(_save())
    return {}


# ── Routing function ─────────────────────────────────────────────

def route_after_assess(state: EnglishTutorState) -> str:
    """Route to the appropriate response node based on assessment."""
    route = state.get("route", "respond")
    if route == "correct":
        return "correct"
    if route == "topic_change":
        return "topic"
    return "respond"


# ── Graph builder ────────────────────────────────────────────────

async def create_english_tutor_graph(use_checkpointer: bool = True):
    """
    Build and compile the English Tutor LangGraph.

    Graph:
        assess -> prepare_context -> {respond, correct, topic} -> save_memory -> END
    """
    builder = StateGraph(EnglishTutorState)

    # Add nodes
    builder.add_node("assess", assess_node)
    builder.add_node("prepare_context", prepare_context_node)
    builder.add_node("respond", respond_node)
    builder.add_node("correct", correct_node)
    builder.add_node("topic", topic_node)
    builder.add_node("save_memory", save_memory_node)

    # Set entry point
    builder.set_entry_point("assess")

    # Conditional routing after assessment
    builder.add_conditional_edges(
        "prepare_context",
        route_after_assess,
        {
            "respond": "respond",
            "correct": "correct",
            "topic": "topic",
        },
    )
    builder.add_edge("assess", "prepare_context")

    # All response nodes → save memory → end
    builder.add_edge("respond", "save_memory")
    builder.add_edge("correct", "save_memory")
    builder.add_edge("topic", "save_memory")
    builder.add_edge("save_memory", END)

    # Compile with optional checkpointer for conversation persistence
    checkpointer = None
    if use_checkpointer:
        try:
            pool = await get_connection_pool()
            checkpointer = AsyncPostgresSaver(pool)
            await checkpointer.setup()
            logger.info("LangGraph checkpointer initialized with PostgreSQL")
        except Exception as e:
            logger.warning(f"Checkpointer setup failed, running without persistence: {e}")

    graph = builder.compile(checkpointer=checkpointer)
    logger.info("English Tutor graph compiled successfully")
    return graph
