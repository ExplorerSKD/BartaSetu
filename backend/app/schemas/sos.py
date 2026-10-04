from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SOSCreate(BaseModel):
    device_id: str
    message: Optional[str] = "EMERGENCY! I need help!"
    latitude: float
    longitude: float
    battery_level: Optional[int] = None

class SOSResponse(BaseModel):
    id: str
    user_id: str
    device_id: str
    message: Optional[str] = None
    latitude: float
    longitude: float
    battery_level: Optional[int] = None
    status: str
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True
