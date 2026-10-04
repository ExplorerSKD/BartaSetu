import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.mysql import CHAR
from app.database import Base

class MessageRoute(Base):
    __tablename__ = "message_routes"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id = Column(CHAR(36), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(CHAR(36), nullable=False)
    hop_number = Column(Integer, nullable=False)
    action = Column(String(20), default="RELAY")
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
