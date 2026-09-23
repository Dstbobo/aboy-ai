import asyncio

from app.config import Settings
from app.core.cache import sliding_window_allow


class LiveAdmissionError(Exception):
    """A safe, non-sensitive Live admission failure."""


class LiveConnectionRegistry:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._by_user: dict[str, int] = {}
        self._total = 0

    async def acquire(self, user_id: str, per_user: int, global_limit: int) -> bool:
        async with self._lock:
            if self._total >= global_limit or self._by_user.get(user_id, 0) >= per_user:
                return False
            self._total += 1
            self._by_user[user_id] = self._by_user.get(user_id, 0) + 1
            return True

    async def release(self, user_id: str) -> None:
        async with self._lock:
            current = self._by_user.get(user_id, 0)
            if current <= 1:
                self._by_user.pop(user_id, None)
            else:
                self._by_user[user_id] = current - 1
            if current:
                self._total = max(0, self._total - 1)


live_connections = LiveConnectionRegistry()


async def admit_live_session(user_id: str, settings: Settings) -> None:
    user_allowed, _ = await sliding_window_allow(
        f"live:daily:{user_id}", settings.live_sessions_per_user_per_day, 86_400
    )
    if not user_allowed:
        raise LiveAdmissionError("Live session limit reached")

    global_allowed, _ = await sliding_window_allow(
        "live:global", settings.live_global_sessions_per_minute, 60
    )
    if not global_allowed:
        raise LiveAdmissionError("Live service is busy")

    acquired = await live_connections.acquire(
        user_id,
        settings.live_max_connections_per_user,
        settings.live_max_global_connections,
    )
    if not acquired:
        raise LiveAdmissionError("Live connection limit reached")
