"""
English Tutor Agent entrypoint — wires LangGraph + LiveKit + Memory.
"""

import asyncio
import json
import os
import time
from typing import Optional
from uuid import uuid4

from loguru import logger
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    RoomInputOptions,
    metrics,
)
from livekit.plugins.silero.vad import _VADOptions

from app.agents.english_tutor.graph import create_english_tutor_graph
from app.core.langgraph_adapter import LangGraphAdapter
from app.core.settings import settings
from app.memory.client import MemoryManager, initialize_memory_client

FE_CHAT_TOPIC = os.getenv("FE_CHAT_TOPIC", "ai-text-stream")

_active_tasks: set[asyncio.Task] = set()
_memory_manager: Optional[MemoryManager] = None


async def _get_memory_manager() -> Optional[MemoryManager]:
    """Lazy-initialize the memory manager."""
    global _memory_manager
    if _memory_manager is None:
        try:
            client = await initialize_memory_client()
            _memory_manager = MemoryManager(client)
            logger.info("Memory manager initialized")
        except Exception as e:
            logger.warning(f"Memory manager unavailable (running without memory): {e}")
    return _memory_manager


def prewarm(proc: JobProcess):
    """Pre-warm resources before the agent starts accepting jobs."""
    logger.info("English Tutor Agent pre-warming...")
    # VAD will be loaded by LiveKit's built-in silero plugin


async def entrypoint(ctx: JobContext):
    """Main entrypoint for English Tutor voice assistant."""
    usage_collector = metrics.UsageCollector()
    start_time = time.time()

    logger.info(f"Starting English Tutor agent for room: {ctx.room.name}")

    # ── Parse job metadata ───────────────────────────────────────
    metadata = json.loads(ctx.job.metadata) if ctx.job.metadata else {}
    user_id = metadata.get("user_id", "anonymous")
    topic = metadata.get("topic", "free_conversation")
    level = metadata.get("level", "B1")

    logger.info(f"User: {user_id}, Topic: {topic}, Level: {level}")

    # ── Initialize memory ────────────────────────────────────────
    memory_mgr = await _get_memory_manager()
    memory_prompt = "No previous memories about this learner."
    memory_client_raw = None

    if memory_mgr:
        try:
            memory_prompt = await memory_mgr.search_memories(
                query=f"English learner profile, level {level}, topic {topic}",
                user_id=user_id,
                limit=5,
            )
            memory_client_raw = memory_mgr.client
        except Exception as e:
            logger.warning(f"Memory search failed: {e}")

    # ── Build LangGraph ──────────────────────────────────────────
    thread_id = str(uuid4())
    graph = await create_english_tutor_graph(use_checkpointer=True)

    graph_config = {
        "configurable": {"thread_id": thread_id},
        "metadata": {
            "user_id": user_id,
            "topic": topic,
            "level": level,
            "memory_prompt": memory_prompt,
            "memory_client": memory_client_raw,
            "greeting_message": "",
        },
    }

    # ── Create agent session with LangGraphAdapter ───────────────
    session = AgentSession(
        llm=LangGraphAdapter(graph=graph, config=graph_config),
    )

    # ── Event handlers ───────────────────────────────────────────
    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        logger.info(f"Participant {participant.identity} disconnected")
        ctx.shutdown(reason="User disconnected")

    # ── Connect and wait for participant ─────────────────────────
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    participant = await ctx.wait_for_participant()

    # ── Generate greeting ────────────────────────────────────────
    topic_display = topic.replace("_", " ")
    greeting = (
        f"Hello! I'm your English conversation partner. "
        f"Let's practice some {topic_display} today. "
        f"How are you doing?"
    )
    graph_config["metadata"]["greeting_message"] = greeting

    # ── Start session ────────────────────────────────────────────
    await session.start(
        agent=Agent(
            instructions=(
                f"You are a friendly English tutor. Help the user practice English conversation. "
                f"Gently correct grammar and vocabulary mistakes. Adapt your language to {level} level. "
                f"Current topic: {topic_display}."
            )
        ),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            text_enabled=True,
            video_enabled=False,
            audio_enabled=True,
        ),
    )

    # Send greeting
    await ctx.room.local_participant.send_text(topic=FE_CHAT_TOPIC, text=greeting)
    await session.say(greeting, allow_interruptions=False)

    # ── Handle text chat messages ────────────────────────────────
    async def handle_text_stream_async(reader, participant_identity):
        text = await reader.read_all()
        logger.info(f"Text from {participant_identity}: {text}")

        chat_ctx = session._chat_ctx.copy()
        chat_ctx.add_message(role="user", content=text, interrupted=True)
        stream = session.llm.chat(chat_ctx=chat_ctx)

        writer = await ctx.room.local_participant.stream_text(topic=FE_CHAT_TOPIC)
        async for chunk in stream:
            if chunk.delta and chunk.delta.content:
                await writer.write(chunk.delta.content)
        await writer.aclose()

    def handle_text_stream(reader, participant_identity):
        task = asyncio.create_task(handle_text_stream_async(reader, participant_identity))
        _active_tasks.add(task)
        task.add_done_callback(lambda t: _active_tasks.discard(t))

    ctx.room.register_text_stream_handler(FE_CHAT_TOPIC, handle_text_stream)

    # ── Metrics & logging ────────────────────────────────────────
    @session.on("metrics_collected")
    def on_metrics_collected(mtrcs: metrics.AgentMetrics):
        metrics.log_metrics(mtrcs)
        usage_collector.collect(mtrcs)

    @session.on("agent_started_speaking")
    def on_agent_started_speaking():
        logger.debug("Agent speaking...")

    @session.on("user_speech_committed")
    def on_user_speech_committed():
        logger.debug("User speech committed")

    # ── Shutdown cleanup ─────────────────────────────────────────
    async def cleanup():
        duration = (time.time() - start_time) / 60
        summary = usage_collector.get_summary()
        logger.info(f"Session ended. Duration: {duration:.1f}min, Usage: {summary}")

    ctx.add_shutdown_callback(cleanup)

    logger.info(f"English Tutor ready for {user_id} in room {ctx.room.name}")
