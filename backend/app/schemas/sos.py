from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class SOSCreate(BaseModel):
    # Client-generated id lets the same alert arrive by several mesh paths without duplicates
    id: Optional[str] = Field(default=None, max_length=36)
    device_id: Optional[str] = None
    message: Optional[str] = "EMERGENCY! I need help!"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    battery_level: Optional[int] = None

class SOSRelayed(SOSCreate):
    """An SOS written by another user and carried to the internet by a gateway phone."""
    user_id: str

class SOSSyncRequest(BaseModel):
    alerts: list[SOSRelayed]

class SOSResponse(BaseModel):
    id: str
    user_id: str
    device_id: str
    message: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    battery_level: Optional[int] = None
    status: str
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True
