import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Integer, Text, ForeignKey
from sqlalchemy.dialects.mysql import CHAR
from app.database import Base

class Message(Base):
    __tablename__ = "messages"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sender_id = Column(CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    encrypted_content = Column(Text, nullable=False)
    encrypted_key = Column(Text, nullable=True)
    iv = Column(String(64), nullable=True)
    content_type = Column(String(20), default="text")
    priority = Column(String(20), default="normal")
    status = Column(String(20), default="SERVER_RECEIVED", index=True)
    hop_count = Column(Integer, default=0)
    max_hops = Column(Integer, default=10)
    ttl = Column(Integer, default=86400)
    expires_at = Column(DateTime, nullable=False)
    gateway_device_id = Column(CHAR(36), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    received_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
