from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.sos_alert import SOSAlert
from app.models.user import User
from app.schemas.sos import SOSCreate, SOSResponse
from app.middleware.auth import get_current_user
from app.websocket.manager import manager

router = APIRouter()

@router.post("", response_model=SOSResponse, status_code=201)
async def create_sos(
    sos_data: SOSCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sos = SOSAlert(
        user_id=current_user.id,
        device_id=sos_data.device_id,
        message=sos_data.message,
        latitude=sos_data.latitude,
        longitude=sos_data.longitude,
        battery_level=sos_data.battery_level
    )
    db.add(sos)
    await db.flush()
    
    # Broadcast SOS to all connected users
    sos_response = SOSResponse.model_validate(sos)
    for user_id in manager.active_connections:
        await manager.send_to_user(
            user_id,
            {"type": "sos_alert", "alert": sos_response.model_dump(mode="json")}
        )
    
    return sos_response

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
