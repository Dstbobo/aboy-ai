import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import admin, audit, auth, document, events, feedback, history, intelligence, knowledge, live, media, notifications, profile, query, quiz, stream, streak, transcribe
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
        # Surface the error type + message so production 500s are diagnosable.
        # Safe: exposes the exception class and message, never a full traceback.
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "error_type": type(exc).__name__,
                "error_message": str(exc)[:300],
            },
        )

    @app.get("/health", tags=["health"])
    async def health() -> dict:
        return {"status": "ok", "service": "aboy-ai-backend", "auth": "httpx-v2", "build": "v4-transcribe"}

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
        direct_host = f"db.{project_ref}.supabase.co"

        conn = None
        attempts = []

        # ── 1. Direct host: let the OS choose IPv6 or IPv4 (Supabase DB is IPv6-only) ──
        for port in [5432]:
            try:
                logger.info("Trying direct host %s:%s", direct_host, port)
                conn = await asyncpg.connect(
                    host=direct_host, port=port,
                    user="postgres", password=db_password,
                    database="postgres", ssl="require", timeout=20,
                )
                attempts.append({"host": f"{direct_host}:{port}", "result": "CONNECTED"})
                break
            except Exception as e:
                err = str(e)[:150]
                attempts.append({"host": f"{direct_host}:{port}", "result": err})
                logger.warning("Direct %s:%s failed: %s", direct_host, port, err)

        # ── 2. Regional poolers via IPv4 (fallback) ──
        if conn is None:
            regions = [
                # Try known working region first, then others
                "eu-central-1",
                "us-east-1", "us-east-2", "us-west-1", "us-west-2",
                "eu-west-1", "eu-west-2",
                "ap-southeast-1", "ap-northeast-1", "ca-central-1",
            ]
            for region in regions:
                for port in [6543, 5432]:
                    # Try both aws-1 and aws-0 prefixes (newer projects use aws-1)
                    host = f"aws-1-{region}.pooler.supabase.com"
                    user = f"postgres.{project_ref}"
                    try:
                        addrs = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
                        ipv4 = addrs[0][4][0]
                        conn = await asyncpg.connect(
                            host=ipv4, port=port, user=user,
                            password=db_password, database="postgres",
                            ssl="require", timeout=10,
                        )
                        attempts.append({"host": f"{host}:{port}", "result": "CONNECTED"})
                        break
                    except Exception as e:
                        err = str(e)[:120]
                        attempts.append({"host": f"{host}:{port}", "result": err})
                        logger.warning("Pooler %s:%s failed: %s", host, port, err)
                if conn:
                    break

        if conn is None:
            raise HTTPException(status_code=500, detail={
                "error": "All DB connections failed",
                "attempts": attempts[:25],
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
    app.include_router(quiz.router, prefix="/api/v1", tags=["study"])
    app.include_router(document.router, prefix="/api/v1", tags=["transcribe"])
    app.include_router(transcribe.router, prefix="/api/v1", tags=["transcribe"])
    app.include_router(history.router, prefix="/api/v1", tags=["history"])
    app.include_router(live.router, tags=["live"])  # /ws/live WebSocket proxy
    app.include_router(stream.router, prefix="/api/v1", tags=["query"])
    app.include_router(streak.router, prefix="/api/v1", tags=["study"])
    app.include_router(feedback.router, prefix="/api/v1", tags=["feedback"])
    app.include_router(events.router, prefix="/api/v1", tags=["events"])
    app.include_router(notifications.router, prefix="/api/v1", tags=["notifications"])
    app.include_router(profile.router, prefix="/api/v1", tags=["profile"])
    app.include_router(intelligence.router, prefix="/api/v1", tags=["intelligence"])
    app.include_router(media.router, prefix="/api/v1", tags=["media"])  # public image proxy
    app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
    app.include_router(audit.router, prefix="/api/v1/admin", tags=["admin"])
    app.include_router(knowledge.router, prefix="/api/v1/admin", tags=["knowledge"])

    return app


app = create_app()
