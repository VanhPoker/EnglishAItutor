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
from livekit.plugins import silero

from app.agents.english_tutor.edge_tts_plugin import EdgeTTS
from app.agents.english_tutor.graph import create_english_tutor_graph
from app.agents.english_tutor.session_metrics import (
    build_stats_payload,
    compute_session_scores,
    recommended_profile_level,
)
from app.agents.english_tutor.whisper_stt import WhisperSTT
from app.core.langgraph_adapter import LangGraphAdapter
from app.database.session_repo import (
    create_practice_session,
    end_practice_session,
    log_error,
    update_user_cefr_level,
)
from app.memory.client import MemoryManager, initialize_memory_client

FE_CHAT_TOPIC = os.getenv("FE_CHAT_TOPIC", "ai-text-stream")

_active_tasks: set[asyncio.Task] = set()
_memory_manager: Optional[MemoryManager] = None


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


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

    # ── Create agent session with TTS + STT + LLM ───────────────
    session = AgentSession(
        llm=LangGraphAdapter(graph=graph, config=graph_config),
        tts=EdgeTTS(voice="en-US-JennyNeural"),
        stt=WhisperSTT(model_size="base.en"),
        vad=silero.VAD.load(
            min_speech_duration=_float_env("VAD_MIN_SPEECH_DURATION", 0.15),
            min_silence_duration=_float_env("VAD_MIN_SILENCE_DURATION", 1.05),
            prefix_padding_duration=_float_env("VAD_PREFIX_PADDING_DURATION", 0.55),
            activation_threshold=_float_env("VAD_ACTIVATION_THRESHOLD", 0.55),
        ),
        turn_detection="vad",
        min_endpointing_delay=_float_env("AGENT_MIN_ENDPOINTING_DELAY", 1.1),
        max_endpointing_delay=_float_env("AGENT_MAX_ENDPOINTING_DELAY", 4.5),
        preemptive_generation=False,
        allow_interruptions=False,
    )

    # ── Event handlers ───────────────────────────────────────────
    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        logger.info(f"Participant {participant.identity} disconnected")
        ctx.shutdown(reason="User disconnected")

    # ── Connect and wait for participant ─────────────────────────
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    participant = await ctx.wait_for_participant()

    # ── Persist session to DB ────────────────────────────────────
    db_session_id: Optional[str] = None
    if user_id and user_id != "anonymous":
        db_session_id = await create_practice_session(
            user_id=user_id,
            room_name=ctx.room.name,
            topic=topic,
            level=level,
        )

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
            text_enabled=False,
            video_enabled=False,
            audio_enabled=True,
        ),
    )

    # Speak the greeting. The frontend renders the final LiveKit transcription.
    await session.say(greeting, allow_interruptions=False)

    # ── Handle text chat messages ────────────────────────────────
    async def handle_text_stream_async(reader, participant_identity):
        try:
            text = await reader.read_all()
            logger.info(f"Text from {participant_identity}: {text}")

            chat_ctx = session._chat_ctx.copy()
            chat_ctx.add_message(role="user", content=text, interrupted=True)
            stream = session.llm.chat(chat_ctx=chat_ctx)

            response_parts: list[str] = []
            async for chunk in stream:
                if chunk.delta and chunk.delta.content:
                    content = chunk.delta.content
                    response_parts.append(content)

            response_text = "".join(response_parts).strip()
            if response_text:
                await session.say(response_text, allow_interruptions=False)
        except Exception as e:
            logger.error(f"Error handling text stream: {e}", exc_info=True)

    def handle_text_stream(reader, participant_identity):
        task = asyncio.create_task(handle_text_stream_async(reader, participant_identity))
        _active_tasks.add(task)
        task.add_done_callback(lambda t: _active_tasks.discard(t))

    ctx.room.register_text_stream_handler(FE_CHAT_TOPIC, handle_text_stream)

    # ── Metrics & logging ────────────────────────────────────────
    @session.on("metrics_collected")
    def on_metrics_collected(mtrcs: metrics.AgentMetrics):
        try:
            metrics.log_metrics(mtrcs)
            usage_collector.collect(mtrcs)
        except Exception:
            pass

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

        if db_session_id:
            state_values = {}
            try:
                state = await graph.aget_state(graph_config)
                state_values = state.values or {}
            except Exception as exc:
                logger.warning(f"Failed to load final graph state: {exc}")

            session_stats = state_values.get("session_stats") or {}
            scorecard = compute_session_scores(session_stats, level)
            stats_payload = build_stats_payload(session_stats, level)

            error_patterns = (session_stats.get("error_patterns") or {}).values()
            for item in error_patterns:
                repeat_count = max(1, int(item.get("count") or 1))
                for _ in range(repeat_count):
                    await log_error(
                        session_id=db_session_id,
                        user_id=user_id,
                        error_type=item.get("error_type", "grammar"),
                        original_text=item.get("original", ""),
                        corrected_text=item.get("correction", ""),
                        explanation=item.get("explanation"),
                    )

            await end_practice_session(
                session_id=db_session_id,
                total_turns=int(session_stats.get("turns") or 0),
                total_errors=int(session_stats.get("total_errors") or 0),
                corrections_given=int(session_stats.get("corrections") or 0),
                duration_minutes=round(duration, 2),
                grammar_score=scorecard["grammar_score"],
                vocabulary_score=scorecard["vocabulary_score"],
                fluency_score=scorecard["fluency_score"],
                stats_json=stats_payload,
            )

            recommended_level = recommended_profile_level(session_stats, level)
            if recommended_level and user_id != "anonymous":
                await update_user_cefr_level(user_id, recommended_level)

    ctx.add_shutdown_callback(cleanup)

    logger.info(f"English Tutor ready for {user_id} in room {ctx.room.name}")
