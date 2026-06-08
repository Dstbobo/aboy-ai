"""
Aboy AI -- Migration runner (ASCII-safe output for Windows)
"""
import asyncio
import os
import sys
import httpx
from pathlib import Path
from dotenv import load_dotenv

# Force UTF-8 stdout on Windows
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_KEY"]
PROJECT_REF  = SUPABASE_URL.replace("https://", "").split(".")[0]

MIGRATIONS = [
    Path(__file__).parent / "app/db/migrations/001_initial_schema.sql",
    Path(__file__).parent / "app/db/migrations/002_push_tokens.sql",
    Path(__file__).parent / "app/db/migrations/003_expanded_roles.sql",
]


async def execute_sql(client: httpx.AsyncClient, sql: str, label: str) -> tuple[bool, int, str]:
    """
    Try to execute SQL via Supabase Management API.
    Returns (success, status_code, response_text).
    """
    endpoints = [
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        f"{SUPABASE_URL}/pg/v1/query",
    ]
    last_status = 0
    last_text = ""

    for url in endpoints:
        try:
            resp = await client.post(
                url,
                json={"query": sql},
                headers={
                    "Authorization": f"Bearer {SERVICE_KEY}",
                    "Content-Type": "application/json",
                    "apikey": SERVICE_KEY,
                },
                timeout=60,
            )
            last_status = resp.status_code
            last_text = resp.text[:300]
            if resp.status_code in (200, 201):
                print(f"  [OK] {label} via {url}")
                return True, resp.status_code, resp.text
            print(f"  [SKIP] {url} -> {resp.status_code}: {resp.text[:150]}")
        except Exception as e:
            print(f"  [ERR] {url}: {e}")

    return False, last_status, last_text


async def main():
    print("=" * 60)
    print("Aboy AI -- Migration Runner")
    print(f"Project ref: {PROJECT_REF}")
    print(f"Supabase URL: {SUPABASE_URL}")
    print("=" * 60)

    async with httpx.AsyncClient() as client:
        # Verify connection
        try:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/",
                headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
                timeout=10,
            )
            print(f"Supabase REST connection: HTTP {resp.status_code}")
        except Exception as e:
            print(f"[FAIL] Cannot reach Supabase: {e}")
            sys.exit(1)

        manual_sql: list[tuple[str, str]] = []

        for migration_path in MIGRATIONS:
            if not migration_path.exists():
                print(f"[WARN] Missing: {migration_path.name} -- skipping")
                continue

            sql = migration_path.read_text(encoding="utf-8")
            print(f"\nRunning {migration_path.name} ({len(sql)} chars)...")

            ok, status, text = await execute_sql(client, sql, migration_path.name)
            if not ok:
                manual_sql.append((migration_path.name, sql))
                print(f"  [WARN] Auto-run failed (last HTTP {status})")

    # Output combined SQL file regardless — useful for verification
    combined_path = Path(__file__).parent / "all_migrations.sql"
    all_sql_content = "\n\n".join(
        f"-- ===== {name} =====\n{sql}"
        for name, sql in [(m.name, m.read_text("utf-8")) for m in MIGRATIONS if m.exists()]
    )
    combined_path.write_text(all_sql_content, encoding="utf-8")
    print(f"\nAll SQL written to: {combined_path}")

    if manual_sql:
        print("\n" + "=" * 60)
        print("MANUAL MIGRATION REQUIRED")
        print("=" * 60)
        print("1. Open: https://supabase.com/dashboard/project/szsdvkziqskrfveuemsi/sql/new")
        print("2. Paste contents of: backend/all_migrations.sql")
        print("3. Click Run")
        print("=" * 60)
        return False
    else:
        print("\n[OK] All migrations applied!")
        return True


if __name__ == "__main__":
    result = asyncio.run(main())
    sys.exit(0 if result else 1)
