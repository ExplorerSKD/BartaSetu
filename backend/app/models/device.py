import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Float, ForeignKey
from sqlalchemy.dialects.mysql import CHAR
from sqlalchemy.orm import relationship
from app.database import Base

class Device(Base):
    __tablename__ = "devices"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_name = Column(String(100), nullable=True)
    fcm_token = Column(String(512), nullable=True)
    platform = Column(String(20), default="android")
    last_seen = Column(DateTime, nullable=True)
    is_online = Column(Boolean, default=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="devices")
