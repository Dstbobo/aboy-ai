"""
Gemini Live WebSocket proxy — /ws/live

Bridges the mobile app and the Gemini Live API (BidiGenerateContent) so the
API key never ships in the app. Mirrors the Node proxy (aboy-live) but runs
inside the main FastAPI backend.
"""
import asyncio
import logging

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()

_GEMINI_WS = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"
)


@router.websocket("/ws/live")
async def gemini_live_proxy(client_ws: WebSocket) -> None:
    await client_ws.accept()
    settings = get_settings()
    if not settings.gemini_api_key:
        await client_ws.close(code=1011, reason="GEMINI_API_KEY not configured")
        return

    url = f"{_GEMINI_WS}?key={settings.gemini_api_key}"
    try:
        async with websockets.connect(url, max_size=16 * 1024 * 1024) as gemini_ws:
            logger.info("live: connected to Gemini")

            async def forward_to_gemini() -> None:
                try:
                    while True:
                        message = await client_ws.receive_text()
                        await gemini_ws.send(message)
                except WebSocketDisconnect:
                    pass
                except Exception as exc:  # noqa: BLE001
                    logger.info("live: client->gemini ended: %s", exc)

            async def forward_to_client() -> None:
                try:
                    async for message in gemini_ws:
                        if isinstance(message, bytes):
                            await client_ws.send_bytes(message)
                        else:
                            await client_ws.send_text(message)
                except Exception as exc:  # noqa: BLE001
                    logger.info("live: gemini->client ended: %s", exc)

            done, pending = await asyncio.wait(
                [asyncio.create_task(forward_to_gemini()), asyncio.create_task(forward_to_client())],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
    except Exception as exc:  # noqa: BLE001
        logger.warning("live: upstream connect failed: %s", exc)
    finally:
        try:
            await client_ws.close()
        except Exception:  # noqa: BLE001
            pass
