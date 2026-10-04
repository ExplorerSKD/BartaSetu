import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Integer, Float, Text, ForeignKey
from sqlalchemy.dialects.mysql import CHAR
from app.database import Base

class SOSAlert(Base):
    __tablename__ = "sos_alerts"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(CHAR(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    battery_level = Column(Integer, nullable=True)
    status = Column(String(20), default="ACTIVE", index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime, nullable=True)
