import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import live
from app.core.auth import middleware
from app.models.user import AuthenticatedUser
from app.security import live_guard
from app.security.live_guard import LiveConnectionRegistry


REPO_ROOT = Path(__file__).resolve().parents[3]


class _AuthResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _AuthClient:
    response = _AuthResponse(200, {})
    last_headers = None

    def __init__(self, **_kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def get(self, _url, headers):
        type(self).last_headers = headers
        return type(self).response


class _ProfileQuery:
    def select(self, *_args):
        return self

    def eq(self, *_args):
        return self

    def maybe_single(self):
        return self

    async def execute(self):
        return SimpleNamespace(data={"role": "pro_nurse", "sub_role": "ICU"})


class _ProfileDb:
    def table(self, name):
        assert name == "user_profiles"
        return _ProfileQuery()


@pytest.mark.asyncio
async def test_access_token_uses_anon_key_and_server_profile(monkeypatch) -> None:
    _AuthClient.response = _AuthResponse(200, {"id": "verified-user", "email": "u@example.test"})
    monkeypatch.setattr(middleware.httpx, "AsyncClient", _AuthClient)
    monkeypatch.setattr(
        middleware,
        "get_settings",
        lambda: SimpleNamespace(
            supabase_url="https://project.supabase.co",
            supabase_anon_key="public-anon-key",
            supabase_service_key="must-not-be-used-for-auth",
        ),
    )

    async def fake_get_db():
        return _ProfileDb()

    monkeypatch.setattr(middleware, "get_db", fake_get_db)
    user = await middleware.authenticate_access_token("access-token")

    assert user.user_id == "verified-user"
    assert user.role == "pro_nurse"
    assert _AuthClient.last_headers["apikey"] == "public-anon-key"
    assert "must-not-be-used" not in _AuthClient.last_headers["apikey"]


@pytest.mark.asyncio
async def test_profile_failure_does_not_preserve_admin_claim(monkeypatch) -> None:
    _AuthClient.response = _AuthResponse(
        200,
        {"id": "verified-user", "email": "u@example.test", "app_metadata": {"role": "admin"}},
    )
    monkeypatch.setattr(middleware.httpx, "AsyncClient", _AuthClient)
    monkeypatch.setattr(
        middleware,
        "get_settings",
        lambda: SimpleNamespace(
            supabase_url="https://project.supabase.co",
            supabase_anon_key="public-anon-key",
        ),
    )

    async def broken_get_db():
        raise ConnectionError("database unavailable")

    monkeypatch.setattr(middleware, "get_db", broken_get_db)
    user = await middleware.authenticate_access_token("access-token")
    assert user.role == "student_med"


@pytest.mark.parametrize("token_label", ["invalid", "expired", "revoked"])
@pytest.mark.asyncio
async def test_supabase_rejected_token_is_unauthorized(monkeypatch, token_label) -> None:
    _AuthClient.response = _AuthResponse(401, {"error": "not exposed to caller"})
    monkeypatch.setattr(middleware.httpx, "AsyncClient", _AuthClient)
    monkeypatch.setattr(
        middleware,
        "get_settings",
        lambda: SimpleNamespace(
            supabase_url="https://project.supabase.co",
            supabase_anon_key="public-anon-key",
        ),
    )
    with pytest.raises(HTTPException) as error:
        await middleware.authenticate_access_token(f"{token_label}-access-token")
    assert error.value.status_code == 401
    assert error.value.detail == "Invalid or expired token"


class _FakeSocket:
    def __init__(self, first_frame: dict):
        self.first_frame = json.dumps(first_frame)
        self.accepted = False
        self.closed = []
        self.sent = []

    async def accept(self):
        self.accepted = True

    async def receive_text(self):
        return self.first_frame

    async def close(self, code, reason):
        self.closed.append((code, reason))

    async def send_json(self, value):
        self.sent.append(value)


@pytest.mark.asyncio
async def test_client_provided_user_id_cannot_authenticate(monkeypatch) -> None:
    socket = _FakeSocket({"type": "auth", "userId": "forged-user"})
    upstream_called = False

    def forbidden_upstream(*_args, **_kwargs):
        nonlocal upstream_called
        upstream_called = True
        raise AssertionError("upstream must not be opened")

    monkeypatch.setattr(
        live, "get_settings", lambda: SimpleNamespace(live_auth_timeout_seconds=1)
    )
    monkeypatch.setattr(live.websockets, "connect", forbidden_upstream)
    await live.gemini_live_proxy(socket)

    assert socket.accepted
    assert socket.closed[0][0] == 4401
    assert not upstream_called


@pytest.mark.asyncio
async def test_verified_identity_overrides_forged_frame_identity(monkeypatch) -> None:
    socket = _FakeSocket(
        {"type": "auth", "accessToken": "access-token", "userId": "forged-user"}
    )
    admitted_user_ids = []

    async def verified_user(_token):
        return AuthenticatedUser(
            user_id="verified-user", email="u@example.test", role="student_med"
        )

    async def record_admission(user_id, _settings):
        admitted_user_ids.append(user_id)

    monkeypatch.setattr(
        live,
        "get_settings",
        lambda: SimpleNamespace(live_auth_timeout_seconds=1, gemini_api_key=""),
    )
    monkeypatch.setattr(live, "authenticate_access_token", verified_user)
    monkeypatch.setattr(live, "admit_live_session", record_admission)
    await live.gemini_live_proxy(socket)

    assert admitted_user_ids == ["verified-user"]
    assert all(item != "forged-user" for item in admitted_user_ids)


@pytest.mark.asyncio
async def test_connection_registry_enforces_user_and_global_caps() -> None:
    registry = LiveConnectionRegistry()
    assert await registry.acquire("one", 1, 2)
    assert not await registry.acquire("one", 1, 2)
    assert await registry.acquire("two", 1, 2)
    assert not await registry.acquire("three", 1, 2)
    await registry.release("one")
    assert await registry.acquire("three", 1, 2)


@pytest.mark.asyncio
async def test_live_quota_denial_rejects_admission(monkeypatch) -> None:
    async def denied(*_args, **_kwargs):
        return False, 20

    monkeypatch.setattr(live_guard, "sliding_window_allow", denied)
    settings = SimpleNamespace(
        live_sessions_per_user_per_day=20,
        live_global_sessions_per_minute=60,
        live_max_connections_per_user=1,
        live_max_global_connections=20,
    )
    with pytest.raises(live_guard.LiveAdmissionError):
        await live_guard.admit_live_session("verified-user", settings)


def test_all_live_clients_use_token_handshake_not_query_identity() -> None:
    mobile = (REPO_ROOT / "mobile/services/geminiLive.ts").read_text(encoding="utf-8")
    node = (REPO_ROOT / "mobile/services/gemini-live-server/server.js").read_text(
        encoding="utf-8"
    )
    assert "?userId=" not in mobile
    assert "searchParams.get('userId')" not in node
    assert "accessToken: this.accessToken" in mobile
    assert "authenticateAccessToken(auth.accessToken)" in node
    assert "apikey: SUPABASE_ANON_KEY" in node
    assert "session.userId = user.id" in node
    assert "user_id: session.userId" in node
