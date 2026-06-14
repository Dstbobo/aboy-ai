"""Fire-and-forget background tasks that actually run to completion.

`asyncio.create_task` returns a task that the event loop only holds a *weak*
reference to — if the caller keeps no reference, CPython can garbage-collect it
mid-flight, so the work silently never finishes. This was dropping audit logs
and profile updates (especially on the streaming endpoint). Keeping a strong
reference until the task is done fixes it.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Coroutine

logger = logging.getLogger(__name__)

_tasks: set[asyncio.Task] = set()


def fire_and_forget(coro: Coroutine) -> None:
    task = asyncio.create_task(coro)
    _tasks.add(task)

    def _done(t: asyncio.Task) -> None:
        _tasks.discard(t)
        exc = t.exception() if not t.cancelled() else None
        if exc:
            logger.warning("background task failed: %s", exc)

    task.add_done_callback(_done)
