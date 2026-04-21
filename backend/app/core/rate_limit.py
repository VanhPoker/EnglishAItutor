"""Small in-memory rate limiter for auth endpoints."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def hit(self, key: str, limit: int, window_seconds: int) -> int | None:
        """Record an event and return retry-after seconds if the key is over limit."""
        now = time.monotonic()

        async with self._lock:
            events = self._events[key]
            cutoff = now - window_seconds
            while events and events[0] <= cutoff:
                events.popleft()

            if len(events) >= limit:
                retry_after = int(window_seconds - (now - events[0])) + 1
                return max(retry_after, 1)

            events.append(now)
            return None


auth_rate_limiter = InMemoryRateLimiter()
