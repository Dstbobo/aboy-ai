"""
Integration tests for POST /api/v1/query.
These require a running backend with valid env vars.
Mark with @pytest.mark.integration to skip in CI without keys.
"""

import pytest
from httpx import AsyncClient
from app.main import app


@pytest.mark.asyncio
@pytest.mark.integration
async def test_health_endpoint():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_requires_auth():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/v1/query", json={"query": "What is metformin?"})
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.integration
async def test_query_rejects_empty():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/query",
            json={"query": ""},
            headers={"Authorization": "Bearer fake-token"},
        )
    assert response.status_code in (401, 422)
