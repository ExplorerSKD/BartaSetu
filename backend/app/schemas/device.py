from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class DeviceRegister(BaseModel):
    # Id returned by an earlier registration; re-registering with it updates instead of duplicating
    id: Optional[str] = None
    device_name: str
    fcm_token: Optional[str] = None
    platform: str = "android"
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class DeviceResponse(BaseModel):
    id: str
    user_id: str
    device_name: Optional[str] = None
    platform: str
    is_online: bool = False
    last_seen: Optional[datetime] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
