from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.user import AuthenticatedUser
from app.security import provider_guard


REPO_ROOT = Path(__file__).resolve().parents[3]
USER = AuthenticatedUser(user_id="user-1", email="u@example.test", role="student_med")


def _settings():
    return SimpleNamespace(
        provider_max_text_chars=100,
        provider_max_upload_bytes=1000,
        provider_user_requests_per_minute=2,
        provider_global_requests_per_minute=10,
    )


@pytest.mark.asyncio
async def test_oversized_request_is_rejected_before_rate_counter(monkeypatch) -> None:
    called = False

    async def limiter(*_args, **_kwargs):
        nonlocal called
        called = True
        return True, 1

    monkeypatch.setattr(provider_guard, "get_settings", _settings)
    monkeypatch.setattr(provider_guard, "sliding_window_allow", limiter)
    with pytest.raises(HTTPException) as error:
        await provider_guard.enforce_provider_request(USER, text_chars=101)
    assert error.value.status_code == 413
    assert not called


@pytest.mark.asyncio
async def test_user_limit_rejects_before_global_counter(monkeypatch) -> None:
    subjects = []

    async def limiter(subject, *_args, **_kwargs):
        subjects.append(subject)
        return False, 2

    monkeypatch.setattr(provider_guard, "get_settings", _settings)
    monkeypatch.setattr(provider_guard, "sliding_window_allow", limiter)
    with pytest.raises(HTTPException) as error:
        await provider_guard.enforce_provider_request(USER)
    assert error.value.status_code == 429
    assert subjects == ["provider:user:user-1"]
    assert error.value.headers == {"Retry-After": "60"}


@pytest.mark.asyncio
async def test_global_limit_is_enforced(monkeypatch) -> None:
    results = iter(((True, 1), (False, 10)))

    async def limiter(*_args, **_kwargs):
        return next(results)

    monkeypatch.setattr(provider_guard, "get_settings", _settings)
    monkeypatch.setattr(provider_guard, "sliding_window_allow", limiter)
    with pytest.raises(HTTPException) as error:
        await provider_guard.enforce_provider_request(USER)
    assert error.value.status_code == 429
    assert "busy" in error.value.detail.lower()


@pytest.mark.asyncio
async def test_valid_request_passes_both_counters(monkeypatch) -> None:
    subjects = []

    async def limiter(subject, *_args, **_kwargs):
        subjects.append(subject)
        return True, 1

    monkeypatch.setattr(provider_guard, "get_settings", _settings)
    monkeypatch.setattr(provider_guard, "sliding_window_allow", limiter)
    await provider_guard.enforce_provider_request(USER, text_chars=100, request_bytes=1000)
    assert subjects == ["provider:user:user-1", "provider:global"]


def test_every_paid_http_entry_point_uses_shared_guard_and_auth() -> None:
    paths = (
        "backend/app/api/v1/query.py",
        "backend/app/api/v1/stream.py",
        "backend/app/api/v1/quiz.py",
        "backend/app/api/v1/document.py",
        "backend/app/api/v1/transcribe.py",
    )
    for relative in paths:
        source = (REPO_ROOT / relative).read_text(encoding="utf-8")
        assert "enforce_provider_request" in source
        assert "Depends(get_current_user)" in source


def test_multimodal_routes_do_not_return_provider_exception_text() -> None:
    source = (REPO_ROOT / "backend/app/api/v1/transcribe.py").read_text(encoding="utf-8")
    assert "detail=f\"Transcription failed: {exc}\"" not in source
    assert "detail=f\"Vision failed: {exc}\"" not in source
