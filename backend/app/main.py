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
        db_password = os.environ.get("SUPABASE_DB_PASSWORD", "452345Dst@ff")
        db_host     = os.environ.get("SUPABASE_DB_HOST", "db.szsdvkziqskrfveuemsi.supabase.co")

        try:
            conn = await asyncpg.connect(
                host=db_host,
                port=5432,
                user="postgres",
                password=db_password,
                database="postgres",
                ssl="require",
                timeout=30,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"DB connection failed: {e}")

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
