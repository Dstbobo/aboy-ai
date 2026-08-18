from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1 import profile
from app.core.auth.middleware import is_valid_role
from app.models.user import AuthenticatedUser


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_profile_patch_forbids_server_controlled_fields() -> None:
    for field in ("role", "sub_role", "is_active", "role_verified"):
        with pytest.raises(ValidationError):
            profile.ProfileUpdate.model_validate({field: "attacker-controlled"})


def test_profile_patch_allows_only_profile_content() -> None:
    body = profile.ProfileUpdate(
        full_name="A User",
        specialty="Nursing",
        institution="Teaching Hospital",
        country_code="NG",
        graduation_year=2030,
        details={"year_of_study": 3},
    )
    assert set(body.model_dump(exclude_none=True)) == {
        "full_name",
        "specialty",
        "institution",
        "country_code",
        "graduation_year",
        "details",
    }


def test_role_validation_rejects_admin_like_and_malformed_values() -> None:
    assert is_valid_role("student_med")
    assert is_valid_role("pro_nurse")
    assert not is_valid_role("student_")
    assert not is_valid_role("student_med;admin")
    assert not is_valid_role("administrator")


@pytest.mark.asyncio
async def test_user_cannot_request_admin_role() -> None:
    user = AuthenticatedUser(user_id="user-1", email="u@example.test", role="student_med")
    with pytest.raises(HTTPException) as error:
        await profile.request_role_change(profile.RoleChangeRequest(to_role="admin"), user)
    assert error.value.status_code == 400


class _InvalidRoleRequestTable:
    def __init__(self) -> None:
        self.write_attempted = False

    def select(self, *_args):
        return self

    def eq(self, *_args):
        return self

    def maybe_single(self):
        return self

    def update(self, *_args):
        self.write_attempted = True
        return self

    async def execute(self):
        return SimpleNamespace(
            data={
                "id": "request-1",
                "user_id": "target-1",
                "from_role": "student_med",
                "to_role": "admin",
                "status": "pending",
            }
        )


class _InvalidRoleRequestDb:
    def __init__(self) -> None:
        self.request_table = _InvalidRoleRequestTable()

    def table(self, name: str):
        assert name == "role_change_requests"
        return self.request_table


@pytest.mark.asyncio
async def test_invalid_stored_request_is_rejected_before_state_change(monkeypatch) -> None:
    db = _InvalidRoleRequestDb()

    async def fake_get_db():
        return db

    monkeypatch.setattr(profile, "get_db", fake_get_db)
    admin = AuthenticatedUser(user_id="admin-1", email="a@example.test", role="admin")
    with pytest.raises(HTTPException) as error:
        await profile.review_role_change("request-1", True, admin)
    assert error.value.status_code == 400
    assert not db.request_table.write_attempted


def test_all_migration_paths_finish_by_dropping_unsafe_service_policies() -> None:
    policy_names = (
        "Service role can insert profiles",
        "Service role inserts audit logs",
        "Service role manages rate limits",
        "Service role inserts live sessions",
        "Service role manages requests",
        "Service manages token usage",
    )
    for relative in (
        "backend/all_migrations.sql",
        "backend/migrations/013_security_boundaries.sql",
        "backend/app/db/migrations/004_security_boundaries.sql",
    ):
        sql = (REPO_ROOT / relative).read_text(encoding="utf-8")
        for policy_name in policy_names:
            assert sql.rfind(f'DROP POLICY IF EXISTS "{policy_name}"') > sql.rfind(
                f'CREATE POLICY "{policy_name}"'
            )
        assert "guard_user_profile_privileges" in sql
        assert "role_change_audit" in sql
