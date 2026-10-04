from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class MessageCreate(BaseModel):
    id: str = Field(..., max_length=36)
    # Original author. Ignored for direct sends (the authenticated user is the sender);
    # required when a gateway uploads a message it relayed for someone else.
    sender_id: Optional[str] = None
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
    max_hops: Optional[int] = None
    expires_at: Optional[datetime] = None
    gateway_device_id: Optional[str] = None
    created_at: Optional[datetime] = None
    received_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MessageSyncRequest(BaseModel):
    messages: list[MessageCreate]

class MessageAck(BaseModel):
    message_id: str
    status: str = "DELIVERED"

class RelayedAck(BaseModel):
    """A delivery acknowledgement carried through the mesh and uploaded by a gateway."""
    message_id: str
    recipient_id: str
    status: str = "DELIVERED"

class RelayedAckRequest(BaseModel):
    acks: list[RelayedAck]

class MessageStatusResponse(BaseModel):
    id: str
    status: str
