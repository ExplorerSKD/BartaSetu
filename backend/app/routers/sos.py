from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.device import Device
from app.models.sos_alert import SOSAlert
from app.models.user import User
from app.schemas.sos import SOSCreate, SOSResponse, SOSSyncRequest
from app.middleware.auth import get_current_user
from app.websocket.manager import manager

router = APIRouter()


async def resolve_device_id(db: AsyncSession, user_id: str, device_id: Optional[str]) -> str:
    """Use the given device if it belongs to the user, else their latest device, else create one."""
    if device_id:
        result = await db.execute(select(Device.id).where(Device.id == device_id, Device.user_id == user_id))
        if result.scalar_one_or_none():
            return device_id
    result = await db.execute(
        select(Device.id).where(Device.user_id == user_id).order_by(Device.created_at.desc()).limit(1)
    )
    latest = result.scalar_one_or_none()
    if latest:
        return latest
    device = Device(user_id=user_id, device_name="Mesh device", platform="android",
                    last_seen=datetime.now(timezone.utc), is_online=False)
    db.add(device)
    await db.flush()
    return device.id


async def create_alert(db: AsyncSession, user_id: str, data: SOSCreate) -> SOSAlert:
    if data.id:
        existing = await db.execute(select(SOSAlert).where(SOSAlert.id == data.id))
        known = existing.scalar_one_or_none()
        if known:
            return known

    sos = SOSAlert(
        user_id=user_id,
        device_id=await resolve_device_id(db, user_id, data.device_id),
        message=data.message,
        latitude=data.latitude,
        longitude=data.longitude,
        battery_level=data.battery_level,
    )
    if data.id:
        sos.id = data.id
    db.add(sos)
    await db.flush()

    # Broadcast SOS to all connected users
    payload = {"type": "sos_alert", "alert": SOSResponse.model_validate(sos).model_dump(mode="json")}
    for connected_user_id in list(manager.active_connections):
        await manager.send_to_user(connected_user_id, payload)
    return sos


@router.post("", response_model=SOSResponse, status_code=201)
async def create_sos(
    sos_data: SOSCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return SOSResponse.model_validate(await create_alert(db, current_user.id, sos_data))


@router.post("/sync", response_model=list[SOSResponse])
async def sync_relayed_sos(
    data: SOSSyncRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload SOS alerts that reached this phone through the offline mesh."""
    results = []
    for alert in data.alerts:
        exists = await db.execute(select(User.id).where(User.id == alert.user_id))
        if exists.scalar_one_or_none() is None:
            continue
        results.append(SOSResponse.model_validate(await create_alert(db, alert.user_id, alert)))
    return results


@router.get("", response_model=list[SOSResponse])
async def get_sos_alerts(
    status_filter: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(SOSAlert)
    if status_filter:
        query = query.where(SOSAlert.status == status_filter)
    query = query.order_by(SOSAlert.created_at.desc())
    result = await db.execute(query)
    alerts = result.scalars().all()
    return [SOSResponse.model_validate(a) for a in alerts]


@router.get("/{sos_id}", response_model=SOSResponse)
async def get_sos_alert(
    sos_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(SOSAlert).where(SOSAlert.id == sos_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="SOS alert not found")
    return SOSResponse.model_validate(alert)
