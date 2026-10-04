from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class MessageCreate(BaseModel):
    id: str
    recipient_id: str
    encrypted_content: str
    encrypted_key: Optional[str] = None
    iv: Optional[str] = None
    content_type: str = "text"
    priority: str = "normal"
    hop_count: int = 0
    max_hops: int = 10
    ttl: int = 86400
    expires_at: datetime
    created_at: datetime
    gateway_device_id: Optional[str] = None
    route: Optional[list[dict]] = None

class MessageResponse(BaseModel):
    id: str
    sender_id: str
    recipient_id: str
    encrypted_content: str
    encrypted_key: Optional[str] = None
    iv: Optional[str] = None
    content_type: str
    priority: str
    status: str
    hop_count: int
    created_at: Optional[datetime] = None
    received_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MessageSyncRequest(BaseModel):
    messages: list[MessageCreate]

class MessageAck(BaseModel):
    message_id: str
    status: str = "DELIVERED"
