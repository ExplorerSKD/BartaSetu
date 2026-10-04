import json
import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import WebSocket, WebSocketDisconnect, status
from sqlalchemy import update

from app.database import async_session
from app.models.device import Device
from app.utils.security import decode_token

logger = logging.getLogger("bartasetu.ws")


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        previous = self.active_connections.get(user_id)
        self.active_connections[user_id] = websocket
        if previous is not None and previous is not websocket:
            try:
                await previous.close()
            except Exception:
                pass

    def disconnect(self, user_id: str, websocket: Optional[WebSocket] = None):
        # Only drop the entry if it still belongs to this socket (a newer one may have replaced it)
        if websocket is None or self.active_connections.get(user_id) is websocket:
            self.active_connections.pop(user_id, None)

    async def send_to_user(self, user_id: str, data: dict) -> bool:
        ws = self.active_connections.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
                return True
            except Exception:
                self.disconnect(user_id, ws)
                return False
        return False

    def is_online(self, user_id: str) -> bool:
        return user_id in self.active_connections

    def get_online_count(self) -> int:
        return len(self.active_connections)


manager = ConnectionManager()


async def set_device_online(user_id: str, device_id: Optional[str], online: bool) -> None:
    """Reflect live socket state in the devices table so the admin panel shows real counts."""
    try:
        async with async_session() as db:
            stmt = update(Device).where(Device.user_id == user_id)
            if device_id:
                stmt = stmt.where(Device.id == device_id)
            await db.execute(stmt.values(is_online=online, last_seen=datetime.now(timezone.utc)))
            await db.commit()
    except Exception as exc:
        logger.warning("Could not update device presence for %s: %s", user_id, exc)


async def websocket_endpoint(websocket: WebSocket, token: str = "", device_id: Optional[str] = None):
    payload = decode_token(token) if token else None
    if not payload or payload.get("type") != "access" or not payload.get("sub"):
        # Accept first so the client receives close code 1008 (and knows to refresh its token);
        # closing before accept turns into a bare HTTP 403 with no code.
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = payload["sub"]
    await websocket.accept()
    await manager.connect(user_id, websocket)
    await set_device_online(user_id, device_id, True)
    await websocket.send_json({"type": "connected", "user_id": user_id})

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif message.get("type") == "status":
                await websocket.send_json({"type": "status", "online_users": manager.get_online_count()})
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user_id, websocket)
        if not manager.is_online(user_id):
            await set_device_online(user_id, device_id, False)
