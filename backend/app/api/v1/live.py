"""Authenticated, bounded Gemini Live WebSocket proxy."""

import asyncio
import contextlib
import json
import logging
import time

import websockets
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.config import get_settings
from app.core.auth.middleware import authenticate_access_token
from app.security.live_guard import LiveAdmissionError, admit_live_session, live_connections

logger = logging.getLogger(__name__)
router = APIRouter()

_GEMINI_WS = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"
)
_AUTH_FRAME_MAX_BYTES = 16_384


async def _close_safely(websocket: WebSocket, code: int, reason: str) -> None:
    with contextlib.suppress(Exception):
        await websocket.close(code=code, reason=reason)


async def _authenticate_socket(client_ws: WebSocket, timeout_seconds: int):
    try:
        raw = await asyncio.wait_for(client_ws.receive_text(), timeout=timeout_seconds)
        if len(raw.encode("utf-8")) > _AUTH_FRAME_MAX_BYTES:
            raise ValueError("oversized authentication frame")
        frame = json.loads(raw)
        if not isinstance(frame, dict) or frame.get("type") != "auth":
            raise ValueError("authentication frame required")
        token = frame.get("accessToken")
        if not isinstance(token, str) or not token:
            raise ValueError("access token required")
        return await authenticate_access_token(token)
    except (TimeoutError, ValueError, WebSocketDisconnect, HTTPException):
        await _close_safely(client_ws, 4401, "Authentication required")
        return None


@router.websocket("/ws/live")
async def gemini_live_proxy(client_ws: WebSocket) -> None:
    """Authenticate before opening Gemini, then enforce time/size/cost bounds."""
    await client_ws.accept()
    settings = get_settings()
    user = await _authenticate_socket(client_ws, settings.live_auth_timeout_seconds)
    if user is None:
        return

    admitted = False
    try:
        try:
            await admit_live_session(user.user_id, settings)
            admitted = True
        except LiveAdmissionError as exc:
            await _close_safely(client_ws, 4429, str(exc))
            return

        if not settings.gemini_api_key:
            await _close_safely(client_ws, 1011, "Live service unavailable")
            return

        await client_ws.send_json({"type": "proxy_status", "status": "authenticated"})
        url = f"{_GEMINI_WS}?key={settings.gemini_api_key}"
        started = time.monotonic()
        counts = {"in": 0, "out": 0}

        async with websockets.connect(
            url,
            max_size=settings.live_max_message_bytes,
            open_timeout=settings.provider_timeout_seconds,
        ) as gemini_ws:
            logger.info("live: authenticated upstream session started")

            async def forward_to_gemini() -> None:
                while True:
                    remaining = settings.live_max_session_seconds - (time.monotonic() - started)
                    if remaining <= 0:
                        raise TimeoutError
                    timeout = min(settings.live_idle_timeout_seconds, remaining)
                    message = await asyncio.wait_for(client_ws.receive_text(), timeout=timeout)
                    if len(message.encode("utf-8")) > settings.live_max_message_bytes:
                        await _close_safely(client_ws, 1009, "Message too large")
                        return
                    counts["in"] += 1
                    await gemini_ws.send(message)

            async def forward_to_client() -> None:
                async for message in gemini_ws:
                    if time.monotonic() - started >= settings.live_max_session_seconds:
                        raise TimeoutError
                    if isinstance(message, bytes):
                        message = message.decode("utf-8", errors="replace")
                    counts["out"] += 1
                    await client_ws.send_text(message)

            tasks = {
                asyncio.create_task(forward_to_gemini()),
                asyncio.create_task(forward_to_client()),
            }
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in pending:
                with contextlib.suppress(asyncio.CancelledError):
                    await task
            for task in done:
                with contextlib.suppress(WebSocketDisconnect, TimeoutError):
                    task.result()
            logger.info(
                "live: authenticated session ended frames_in=%d frames_out=%d",
                counts["in"],
                counts["out"],
            )
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.warning("live: upstream session failed")
        await _close_safely(client_ws, 1011, "Live service unavailable")
    finally:
        if admitted:
            await live_connections.release(user.user_id)
        await _close_safely(client_ws, 1000, "Session ended")
