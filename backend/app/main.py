import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import admin, audit, auth, feedback, knowledge, notifications, profile, query, stream, streak
from app.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# One-time migration secret — Railway env var, deleted after use
_MIGRATION_SECRET = os.environ.get("MIGRATION_SECRET", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Aboy AI backend starting up")
    yield
    logger.info("Aboy AI backend shutting down")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Aboy AI",
        description="RAG-powered healthcare AI platform for students",
        version="0.1.0",
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Migration-Secret"],
    )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled exception: %s", exc, exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    @app.get("/health", tags=["health"])
    async def health() -> dict:
        return {"status": "ok", "service": "aboy-ai-backend"}

    # ── One-shot migration endpoint ──────────────────────────────────────────
    # Called once from CI/deploy tooling, protected by MIGRATION_SECRET.
    # Safe to leave in place — returns 403 if secret not set or wrong.
    @app.post("/internal/run-migrations", tags=["internal"])
    async def run_migrations(x_migration_secret: str = Header(default="")) -> dict:
        if not _MIGRATION_SECRET or x_migration_secret != _MIGRATION_SECRET:
            raise HTTPException(status_code=403, detail="Forbidden")

        import asyncpg

        # Works both locally (backend/app/../all_migrations.sql) and in Docker (/app/all_migrations.sql)
        sql_path = Path(__file__).parent.parent / "all_migrations.sql"
        if not sql_path.exists():
            sql_path = Path("/app/all_migrations.sql")
        if not sql_path.exists():
            raise HTTPException(status_code=500, detail=f"Migration file not found: {sql_path}")

        sql = sql_path.read_text(encoding="utf-8")

        # Parse DB password from env or hard-code for one-shot use
        import socket
        db_password = os.environ.get("SUPABASE_DB_PASSWORD", "452345Dst@ff")
        project_ref = "szsdvkziqskrfveuemsi"

        # All Supabase regions + direct host; session pooler (5432) preferred for DDL
        regions = [
            "us-east-1", "us-east-2", "us-west-1", "us-west-2",
            "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2",
            "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
            "ca-central-1", "sa-east-1", "af-south-1", "me-south-1",
        ]
        hosts = [
            # Direct connection first (bypasses pooler, supports all SQL)
            (f"db.{project_ref}.supabase.co", 5432, "postgres"),
            # Session pooler (port 5432) for all regions — supports DDL
            *[(f"aws-0-{r}.pooler.supabase.com", 5432, f"postgres.{project_ref}") for r in regions],
            # Transaction pooler (port 6543) fallback — may not support DDL but worth trying
            *[(f"aws-0-{r}.pooler.supabase.com", 6543, f"postgres.{project_ref}") for r in regions],
        ]

        # Resolve to IPv4, collect reachable candidates
        candidates = []
        dns_log = {}
        for host, port, user in hosts:
            try:
                addrs = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
                ipv4 = addrs[0][4][0]
                candidates.append((ipv4, port, user, host))
                dns_log[f"{host}:{port}"] = ipv4
            except Exception as e:
                dns_log[f"{host}:{port}"] = f"NORESOLVE:{e}"

        conn = None
        attempts = []
        for ipv4, port, user, orig_host in candidates:
            try:
                conn = await asyncpg.connect(
                    host=ipv4, port=port, user=user,
                    password=db_password, database="postgres",
                    ssl="require", timeout=12,
                )
                logger.info("DB connected via %s:%s", orig_host, port)
                attempts.append({"host": f"{orig_host}:{port}", "result": "CONNECTED"})
                break
            except Exception as e:
                err = str(e)[:120]
                attempts.append({"host": f"{orig_host}:{port}", "result": err})
                logger.warning("DB attempt %s:%s failed: %s", orig_host, port, err)

        if conn is None:
            raise HTTPException(status_code=500, detail={
                "error": "All DB connections failed",
                "attempts": attempts[:20],
                "dns_resolved": {k: v for k, v in dns_log.items() if not v.startswith("NORESOLVE")},
            })

        try:
            await conn.execute(sql)
        except Exception as e:
            await conn.close()
            raise HTTPException(status_code=500, detail=f"Migration error: {e}")

        # Verify tables
        rows = await conn.fetch(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public' ORDER BY table_name"
        )
        tables = [r["table_name"] for r in rows]
        await conn.close()

        return {"status": "ok", "tables_created": tables, "table_count": len(tables)}

    app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
    app.include_router(query.router, prefix="/api/v1", tags=["query"])
    app.include_router(stream.router, prefix="/api/v1", tags=["query"])
    app.include_router(streak.router, prefix="/api/v1", tags=["study"])
    app.include_router(feedback.router, prefix="/api/v1", tags=["feedback"])
    app.include_router(notifications.router, prefix="/api/v1", tags=["notifications"])
    app.include_router(profile.router, prefix="/api/v1", tags=["profile"])
    app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
    app.include_router(audit.router, prefix="/api/v1/admin", tags=["admin"])
    app.include_router(knowledge.router, prefix="/api/v1/admin", tags=["knowledge"])

    return app


app = create_app()
