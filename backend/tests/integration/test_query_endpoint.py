"""
Integration tests for POST /api/v1/query.
These require a running backend with valid env vars.
Mark with @pytest.mark.integration to skip in CI without keys.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth.middleware import get_current_user
from app.main import app
from app.models.user import AuthenticatedUser


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_health_endpoint():
    async with client() as api:
        response = await api.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_requires_auth():
    async with client() as api:
        response = await api.post("/api/v1/query", json={"query": "What is metformin?"})
    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_rejects_empty():
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        user_id="test-user", email="test@example.test", role="student_med"
    )
    try:
        async with client() as api:
            response = await api.post("/api/v1/query", json={"query": ""})
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()
