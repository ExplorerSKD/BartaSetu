from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
    
    def disconnect(self, user_id: str):
        self.active_connections.pop(user_id, None)
    
    async def send_to_user(self, user_id: str, data: dict) -> bool:
        ws = self.active_connections.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
                return True
            except Exception:
                self.disconnect(user_id)
                return False
        return False
    
    def is_online(self, user_id: str) -> bool:
        return user_id in self.active_connections
    
    def get_online_count(self) -> int:
        return len(self.active_connections)

manager = ConnectionManager()

async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back or handle commands
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif message.get("type") == "status":
                    await websocket.send_json({
                        "type": "status",
                        "online_users": manager.get_online_count()
                    })
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
    except WebSocketDisconnect:
        manager.disconnect(user_id)
