"""
mem0 memory client for English Tutor - stores learner profiles and error patterns.
Adapted from callflow/memory_client/client.py
"""

from typing import Optional

from loguru import logger
from mem0 import AsyncMemory

from app.agents.english_tutor.prompts import MEMORY_EXTRACT_PROMPT, MEMORY_UPDATE_PROMPT
from app.core.settings import settings


async def initialize_memory_client(
    update_prompt: str | None = None,
    extract_prompt: str | None = None,
) -> AsyncMemory:
    """
    Initialize mem0 async memory client with pgvector backend.

    Uses Google Gemini as the LLM (free tier) and OpenAI-compatible embeddings.
    Falls back to simpler config if advanced features unavailable.
    """
    update_prompt = update_prompt or MEMORY_UPDATE_PROMPT
    extract_prompt = extract_prompt or MEMORY_EXTRACT_PROMPT.format(date="today")

    config = {
        "vector_store": {
            "provider": "pgvector",
            "config": {
                "user": settings.POSTGRES_MEM0_USER,
                "password": settings.POSTGRES_MEM0_PASSWORD.get_secret_value(),
                "host": settings.POSTGRES_MEM0_DB,  # host stored in DB field (from callflow convention)
                "port": int(settings.POSTGRES_MEM0_PORT),
            },
        },
        "custom_update_memory_prompt": update_prompt,
        "custom_fact_extraction_prompt": extract_prompt,
    }

    # Configure LLM provider for mem0
    if settings.GOOGLE_API_KEY:
        config["llm"] = {
            "provider": "google",
            "config": {
                "model": "gemini-2.0-flash",
                "api_key": settings.GOOGLE_API_KEY.get_secret_value(),
            },
        }
        config["embedder"] = {
            "provider": "google",
            "config": {
                "model": "models/text-embedding-004",
                "api_key": settings.GOOGLE_API_KEY.get_secret_value(),
            },
        }
    elif settings.OPENAI_API_KEY:
        config["llm"] = {
            "provider": "openai",
            "config": {
                "model": "gpt-4o-mini",
                "api_key": settings.OPENAI_API_KEY.get_secret_value(),
            },
        }
        config["embedder"] = {
            "provider": "openai",
            "config": {
                "model": "text-embedding-3-small",
                "api_key": settings.OPENAI_API_KEY.get_secret_value(),
            },
        }
    else:
        raise ValueError("mem0 requires GOOGLE_API_KEY or OPENAI_API_KEY for LLM + embeddings")

    try:
        memory_client = AsyncMemory.from_config(config)
        logger.info("mem0 memory client initialized successfully")
        return memory_client
    except Exception as e:
        logger.error(f"Failed to initialize memory client: {e}")
        raise


class MemoryManager:
    """High-level wrapper for mem0 operations in English tutoring context."""

    def __init__(self, client: AsyncMemory):
        self.client = client

    async def search_memories(self, query: str, user_id: str, limit: int = 5) -> str:
        """Search memories and return formatted prompt string."""
        try:
            results = await self.client.search(query, user_id=user_id)
            return format_memory_search_results(results, limit=limit)
        except Exception as e:
            logger.warning(f"Memory search failed: {e}")
            return "Memory unavailable."

    async def save_memory(self, content: str, user_id: str) -> None:
        """Save new memory content for a user."""
        try:
            await self.client.add(content, user_id=user_id)
            logger.info(f"Memory saved for user {user_id}")
        except Exception as e:
            logger.warning(f"Memory save failed for user {user_id}: {e}")


def format_memory_search_results(
    results: dict | None,
    *,
    limit: int = 5,
    fallback: str = "No previous memories about this learner.",
) -> str:
    """Format mem0 search results for prompt injection."""
    memories = (results or {}).get("results", [])
    if not memories:
        return fallback

    sorted_memories = sorted(
        memories,
        key=lambda item: item.get("score", 0),
        reverse=True,
    )[:limit]
    lines = [f"- {item.get('memory', '').strip()}" for item in sorted_memories if item.get("memory")]
    return "\n".join(lines) if lines else fallback
