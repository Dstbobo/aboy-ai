"""
Run pending SQL migrations against Supabase.
Usage: python -m app.db.migrate
"""

import asyncio
import logging
from pathlib import Path

from app.db.supabase import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def run_migrations() -> None:
    db = await get_db()

    await db.rpc("exec_sql", {
        "sql": """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    }).execute()

    applied_result = await db.table("schema_migrations").select("version").execute()
    applied = {row["version"] for row in (applied_result.data or [])}

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))

    for migration_file in migration_files:
        version = migration_file.stem
        if version in applied:
            logger.info("  SKIP (applied): %s", version)
            continue

        sql = migration_file.read_text()
        logger.info("  Applying: %s", version)
        await db.rpc("exec_sql", {"sql": sql}).execute()
        await db.table("schema_migrations").insert({"version": version}).execute()
        logger.info("  ✓ Applied: %s", version)

    logger.info("Migrations complete.")


if __name__ == "__main__":
    asyncio.run(run_migrations())
