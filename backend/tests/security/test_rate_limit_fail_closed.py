import pytest

from app.core import cache


@pytest.fixture(autouse=True)
def clear_local_windows():
    cache._local_rate_windows.clear()
    yield
    cache._local_rate_windows.clear()


@pytest.mark.asyncio
async def test_missing_redis_enforces_local_limit(monkeypatch) -> None:
    monkeypatch.setattr(cache, "get_redis", lambda: None)

    first = await cache.sliding_window_allow("user:one", 2, 60)
    second = await cache.sliding_window_allow("user:one", 2, 60)
    denied = await cache.sliding_window_allow("user:one", 2, 60)

    assert first == (True, 1)
    assert second == (True, 2)
    assert denied == (False, 2)


class _BrokenPipeline:
    async def __aenter__(self):
        raise ConnectionError("redis unavailable")

    async def __aexit__(self, *_args):
        return False


class _BrokenRedis:
    def pipeline(self, **_kwargs):
        return _BrokenPipeline()


@pytest.mark.asyncio
async def test_broken_redis_enforces_local_limit(monkeypatch) -> None:
    monkeypatch.setattr(cache, "get_redis", lambda: _BrokenRedis())

    assert await cache.sliding_window_allow("user:two", 1, 60) == (True, 1)
    assert await cache.sliding_window_allow("user:two", 1, 60) == (False, 1)


@pytest.mark.asyncio
async def test_invalid_limit_is_denied(monkeypatch) -> None:
    monkeypatch.setattr(cache, "get_redis", lambda: None)
    assert await cache.sliding_window_allow("user:three", 0, 60) == (False, 0)
