import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import admin, audit, auth, feedback, knowledge, notifications, profile, query, stream, streak
from app.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled exception: %s", exc, exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    @app.get("/health", tags=["health"])
    async def health() -> dict:
        return {"status": "ok", "service": "aboy-ai-backend"}

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
