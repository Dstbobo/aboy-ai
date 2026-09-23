from types import SimpleNamespace

import pytest

from app.core import token_budget


@pytest.fixture(autouse=True)
def clear_write_blocks():
    token_budget._usage_write_blocked_until.clear()
    yield
    token_budget._usage_write_blocked_until.clear()


class _BrokenTable:
    def select(self, *_args):
        return self

    def in_(self, *_args):
        return self

    def eq(self, *_args):
        return self

    async def execute(self):
        raise ConnectionError("database unavailable")


class _BrokenDb:
    def table(self, _name):
        return _BrokenTable()

    def rpc(self, *_args, **_kwargs):
        return _BrokenTable()


@pytest.mark.asyncio
async def test_usage_read_failure_does_not_return_zero(monkeypatch) -> None:
    async def broken_db():
        return _BrokenDb()

    monkeypatch.setattr(token_budget, "get_db", broken_db)
    with pytest.raises(token_budget.UsageUnavailableError):
        await token_budget.get_usage("user-1")


@pytest.mark.asyncio
async def test_usage_write_failure_temporarily_blocks_more_spend(monkeypatch) -> None:
    async def broken_db():
        return _BrokenDb()

    monkeypatch.setattr(token_budget, "get_db", broken_db)
    await token_budget.add_usage("user-1", 100)
    assert await token_budget.is_exhausted("user-1") is True


@pytest.mark.asyncio
async def test_invalid_budget_settings_fail_closed() -> None:
    class _SettingsTable(_BrokenTable):
        async def execute(self):
            return SimpleNamespace(
                data=[
                    {"key": "token_limit_mode", "value": "invalid"},
                    {"key": "daily_token_limit", "value": "100"},
                ]
            )

    class _SettingsDb:
        def table(self, _name):
            return _SettingsTable()

    with pytest.raises(token_budget.UsageUnavailableError):
        await token_budget._get_settings(_SettingsDb())
