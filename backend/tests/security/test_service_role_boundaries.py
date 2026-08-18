from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import feedback
from app.core.audit import logger as audit_logger
from app.core.audit.models import AuditEvent
from app.models.user import AuthenticatedUser

REPO_ROOT = Path(__file__).resolve().parents[3]


class _OwnershipTable:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def select(self, *_args):
        return self

    def eq(self, *_args):
        return self

    def maybe_single(self):
        return self

    def insert(self, *_args):
        self.db.inserted.append(self.name)
        return self

    async def execute(self):
        if self.name == "query_sessions":
            return SimpleNamespace(data={"user_id": "different-user"})
        return SimpleNamespace(data=[])


class _OwnershipDb:
    def __init__(self):
        self.inserted = []

    def table(self, name):
        return _OwnershipTable(self, name)


@pytest.mark.asyncio
async def test_audit_writer_rejects_cross_user_session_collision(monkeypatch) -> None:
    db = _OwnershipDb()

    async def fake_get_db():
        return db

    monkeypatch.setattr(audit_logger, "get_db", fake_get_db)
    event = AuditEvent(
        user_id="user-1",
        user_role="student_med",
        session_id="00000000-0000-0000-0000-000000000001",
        query_raw="private question",
        query_enhanced=None,
        query_classification="tier1",
        sources_retrieved=[],
        sources_cited=[],
        response_text="private answer",
        model_used="model",
        tokens_input=1,
        tokens_output=1,
        latency_ms=1,
        safety_flags=[],
        emergency_triggered=False,
        flagged_for_review=False,
        ip_hash=None,
    )
    await audit_logger.log_query(event)
    assert "query_audit_log" not in db.inserted


@pytest.mark.asyncio
async def test_feedback_admin_path_uses_role_not_email_allowlist() -> None:
    non_admin = AuthenticatedUser(
        user_id="user-1", email="founder@example.test", role="student_med"
    )
    with pytest.raises(HTTPException) as error:
        await feedback.list_app_feedback(non_admin)
    assert error.value.status_code == 403


def test_privacy_migration_covers_derived_data_and_service_rpcs() -> None:
    for relative in (
        "backend/migrations/014_data_privacy_boundaries.sql",
        "backend/all_migrations.sql",
    ):
        sql = (REPO_ROOT / relative).read_text(encoding="utf-8")
        for table in (
            "user_intelligence_profile",
            "user_topic_stats",
            "medical_images",
            "image_request_stats",
            "curate_failures",
            "image_resolution_stats",
            "coverage_gaps",
            "funnel_events",
        ):
            assert f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY" in sql
        assert "ai_live_sessions_user_id_fkey" in sql
        assert "ON DELETE CASCADE" in sql
        assert "FROM PUBLIC, anon, authenticated" in sql
        assert "TO service_role" in sql
        assert "GRANT SELECT, UPDATE ON user_profiles TO authenticated" in sql
        assert "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role" in sql


def test_sensitive_payloads_are_not_written_to_runtime_logs() -> None:
    source_paths = (
        "backend/app/core/rag/pipeline.py",
        "backend/app/api/v1/stream.py",
        "backend/app/core/media/image_search.py",
        "backend/app/core/llm/gemini.py",
        "mobile/services/geminiLive.ts",
    )
    combined = "\n".join(
        (REPO_ROOT / relative).read_text(encoding="utf-8") for relative in source_paths
    )
    for forbidden in (
        "q=%.40s",
        "input transcript:",
        "output transcript:",
        "resp.text[:200]",
        "web image search failed for %r",
    ):
        assert forbidden not in combined


def test_service_role_reads_include_user_ownership_filters() -> None:
    feedback_source = (REPO_ROOT / "backend/app/api/v1/feedback.py").read_text(encoding="utf-8")
    intelligence_source = (
        REPO_ROOT / "backend/app/core/intelligence/profile.py"
    ).read_text(encoding="utf-8")
    audit_source = (REPO_ROOT / "backend/app/core/audit/logger.py").read_text(encoding="utf-8")
    assert '.eq("id", audit_id).eq("user_id", user.user_id)' in feedback_source
    assert '.eq("user_id", user_id)' in intelligence_source
    assert "audit session ownership mismatch" in audit_source


def test_local_migration_tools_are_validation_only() -> None:
    runner = (REPO_ROOT / "backend/run_migrations.py").read_text(encoding="utf-8")
    compatibility = (REPO_ROOT / "backend/app/db/migrate.py").read_text(encoding="utf-8")
    combined = runner + compatibility
    assert "write_text(" not in combined
    assert 'rpc("exec_sql"' not in combined
    assert "api.supabase.com" not in combined
    assert "Runtime migration execution is disabled" in compatibility
