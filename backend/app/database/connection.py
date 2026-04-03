"""Database connection management — PostgreSQL async pool."""

from typing import Optional

import psycopg_pool
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.settings import settings

# ── psycopg pool (for LangGraph checkpointer) ───────────────────

_connection_pool: Optional[psycopg_pool.AsyncConnectionPool] = None


async def get_connection_pool() -> psycopg_pool.AsyncConnectionPool:
    """Get or create the async connection pool for LangGraph checkpointer."""
    global _connection_pool
    if _connection_pool is None:
        _connection_pool = psycopg_pool.AsyncConnectionPool(
            conninfo=settings.POSTGRES_URL,
            min_size=2,
            max_size=10,
            open=False,
        )
        await _connection_pool.open()
        logger.info("PostgreSQL connection pool opened")
    return _connection_pool


async def close_connection_pool():
    """Close the connection pool on shutdown."""
    global _connection_pool
    if _connection_pool:
        await _connection_pool.close()
        _connection_pool = None
        logger.info("PostgreSQL connection pool closed")


# ── SQLAlchemy async engine (for app data) ───────────────────────

_engine = None
_session_factory = None


def get_async_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.ASYNC_POSTGRES_URL,
            pool_size=5,
            max_overflow=10,
            echo=settings.is_dev(),
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_async_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db() -> AsyncSession:
    """FastAPI dependency for database sessions."""
    factory = get_session_factory()
    async with factory() as session:
        yield session
