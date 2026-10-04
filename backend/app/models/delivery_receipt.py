import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.mysql import CHAR
from app.database import Base

class DeliveryReceipt(Base):
    __tablename__ = "delivery_receipts"

    id = Column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id = Column(CHAR(36), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="DELIVERED")
    received_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
