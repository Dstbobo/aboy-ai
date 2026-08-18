from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_ephemeral_database_workflow_is_production_independent() -> None:
    workflow = (REPO_ROOT / ".github/workflows/security.yml").read_text(encoding="utf-8")
    config = (REPO_ROOT / "supabase/config.toml").read_text(encoding="utf-8")
    combined = workflow + config
    assert "supabase db start" in workflow
    assert "supabase test db" in workflow
    assert "013_security_boundaries.sql" in workflow
    assert "014_data_privacy_boundaries.sql" in workflow
    assert "00000000-0000-4000-8000-000000000014" in workflow
    assert "supabase.com/dashboard/project/" not in combined
    assert "--project-ref" not in combined
    assert "SUPABASE_ACCESS_TOKEN" not in combined
    assert "supabase link" not in combined
    assert "db push" not in combined


def test_ephemeral_sql_covers_required_security_boundaries() -> None:
    rls_test = (REPO_ROOT / "supabase/tests/database/aboy_security.sql").read_text(
        encoding="utf-8"
    )
    constraint_test = (
        REPO_ROOT / "backend/tests/database/validate_legacy_constraints.sql"
    ).read_text(encoding="utf-8")
    for required in (
        "SET LOCAL ROLE anon",
        "SET LOCAL ROLE authenticated",
        "SET LOCAL ROLE service_role",
        "auth.uid()",
        "auth.jwt()",
        "ordinary user role escalation is rejected",
        "cross-user feedback ownership is rejected",
        "deleting an ordinary identity cascades",
        "validated constraints reject new orphaned records",
    ):
        assert required in rls_test
    assert "NOT VALID" in constraint_test
    assert "VALIDATE CONSTRAINT" in constraint_test
    assert "orphaned legacy data unexpectedly passed" in constraint_test
