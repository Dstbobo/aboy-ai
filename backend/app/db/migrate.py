"""Compatibility entry point for migration-bundle validation only.

The former service-role `exec_sql` runner was incomplete and could bypass the
approved staging process. It must never apply schema changes from application
runtime credentials.
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def validate_migration_bundle() -> Path:
    bundle = Path(__file__).resolve().parents[2] / "all_migrations.sql"
    if not bundle.is_file():
        raise RuntimeError("Canonical migration bundle is missing")
    sql = bundle.read_text(encoding="utf-8")
    if "-- 014:" not in sql or "guard_user_profile_privileges" not in sql:
        raise RuntimeError("Canonical migration bundle is incomplete")
    return bundle


async def run_migrations() -> None:
    validate_migration_bundle()
    raise RuntimeError(
        "Runtime migration execution is disabled; use the approved staging migration workflow"
    )


if __name__ == "__main__":
    try:
        path = validate_migration_bundle()
        logger.info("migration bundle valid: %s", path.name)
    except RuntimeError:
        logger.error("migration bundle validation failed")
        raise
