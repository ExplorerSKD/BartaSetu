from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from app.database import get_db
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceRegister, DeviceResponse
from app.middleware.auth import get_current_user

router = APIRouter()

@router.post("/register", response_model=DeviceResponse, status_code=201)
async def register_device(
    device_data: DeviceRegister,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if device_data.id:
        result = await db.execute(
            select(Device).where(Device.id == device_data.id, Device.user_id == current_user.id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.device_name = device_data.device_name
            existing.fcm_token = device_data.fcm_token or existing.fcm_token
            existing.platform = device_data.platform
            if device_data.latitude is not None:
                existing.latitude = device_data.latitude
                existing.longitude = device_data.longitude
            existing.last_seen = datetime.now(timezone.utc)
            existing.is_online = True
            await db.flush()
            return DeviceResponse.model_validate(existing)

    device = Device(
        user_id=current_user.id,
        device_name=device_data.device_name,
        fcm_token=device_data.fcm_token,
        platform=device_data.platform,
        latitude=device_data.latitude,
        longitude=device_data.longitude,
        last_seen=datetime.now(timezone.utc),
        is_online=True
    )
    db.add(device)
    await db.flush()
    return DeviceResponse.model_validate(device)

@router.get("", response_model=list[DeviceResponse])
async def get_devices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Device).where(Device.user_id == current_user.id))
    devices = result.scalars().all()
    return [DeviceResponse.model_validate(d) for d in devices]
