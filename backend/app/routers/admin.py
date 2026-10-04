from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_db
from app.models.user import User
from app.models.device import Device
from app.models.message import Message
from app.models.sos_alert import SOSAlert
from app.models.message_route import MessageRoute
from app.models.public_key import PublicKey

router = APIRouter()

@router.get("/stats")
async def get_system_stats(db: AsyncSession = Depends(get_db)):
    # 1. User stats
    total_users_q = await db.execute(select(func.count()).select_from(User))
    total_users = total_users_q.scalar() or 0

    # 2. Device stats
    total_dev_q = await db.execute(select(func.count()).select_from(Device))
    total_devices = total_dev_q.scalar() or 0

    online_dev_q = await db.execute(select(func.count()).select_from(Device).where(Device.is_online == True))
    online_devices = online_dev_q.scalar() or 0
    offline_devices = max(0, total_devices - online_devices)

    # 3. Message stats
    total_msg_q = await db.execute(select(func.count()).select_from(Message))
    total_messages = total_msg_q.scalar() or 0

    delivered_msg_q = await db.execute(select(func.count()).select_from(Message).where(Message.status == "DELIVERED"))
    delivered_messages = delivered_msg_q.scalar() or 0

    pending_msg_q = await db.execute(
        select(func.count()).select_from(Message).where(Message.status.in_(["PENDING", "SERVER_RECEIVED", "RELAYING"]))
    )
    pending_messages = pending_msg_q.scalar() or 0

    failed_msg_q = await db.execute(select(func.count()).select_from(Message).where(Message.status == "FAILED"))
    failed_messages = failed_msg_q.scalar() or 0

    # 4. SOS stats
    active_sos_q = await db.execute(select(func.count()).select_from(SOSAlert).where(SOSAlert.status == "ACTIVE"))
    active_sos = active_sos_q.scalar() or 0

    return {
        # CamelCase for React Admin dashboard
        "totalUsers": total_users,
        "totalDevices": total_devices,
        "onlineDevices": online_devices,
        "offlineRelays": offline_devices,
        "deliveredMessages": delivered_messages,
        "pendingInMesh": pending_messages,
        "activeSOSEmergencies": active_sos,
        # Snake_case compatibility
        "total_users": total_users,
        "total_devices": total_devices,
        "online_devices": online_devices,
        "offline_devices": offline_devices,
        "total_messages": total_messages,
        "delivered_messages": delivered_messages,
        "pending_messages": pending_messages,
        "failed_messages": failed_messages,
        "active_sos_alerts": active_sos,
    }

@router.get("/users")
async def get_admin_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(desc(User.created_at)).limit(100))
    users = result.scalars().all()
    
    # Check public keys
    pk_res = await db.execute(select(PublicKey.user_id))
    users_with_pk = set(pk_res.scalars().all())

    user_items = []
    for u in users:
        user_items.append({
            "id": u.id,
            "displayName": u.display_name or u.username,
            "username": u.username,
            "email": u.email,
            "creationDate": u.created_at.isoformat() if u.created_at else None,
            "hasPublicKey": u.id in users_with_pk
        })
    return user_items

@router.get("/devices")
async def get_admin_devices(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).order_by(desc(Device.created_at)).limit(100))
    devices = result.scalars().all()

    device_items = []
    for d in devices:
        loc = None
        if d.latitude is not None and d.longitude is not None:
            loc = {"lat": d.latitude, "lon": d.longitude}
        device_items.append({
            "id": d.id,
            "userId": d.user_id,
            "platform": d.platform or "Android",
            "lastSeen": d.last_seen.isoformat() if d.last_seen else (d.created_at.isoformat() if d.created_at else None),
            "isOnline": d.is_online,
            "location": loc
        })
    return device_items

@router.get("/messages")
async def get_admin_messages(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Message).order_by(desc(Message.created_at)).limit(100))
    messages = result.scalars().all()

    # Get routes for preview
    msg_items = []
    for m in messages:
        hops_res = await db.execute(
            select(MessageRoute).where(MessageRoute.message_id == m.id).order_by(MessageRoute.hop_number)
        )
        hops = hops_res.scalars().all()
        if hops:
            preview = " -> ".join([f"Hop {h.hop_number} ({h.device_id[:6]})" for h in hops]) + " -> Server"
        else:
            preview = "Direct Gateway Upload"

        msg_items.append({
            "id": m.id,
            "senderId": m.sender_id,
            "recipientId": m.recipient_id,
            "hopCount": m.hop_count,
            "status": m.status,
            "routePreview": preview,
            "timestamp": m.created_at.isoformat() if m.created_at else None
        })
    return msg_items

@router.get("/sos")
async def get_admin_sos_alerts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SOSAlert).order_by(desc(SOSAlert.created_at)).limit(50))
    alerts = result.scalars().all()

    sos_items = []
    for a in alerts:
        sos_items.append({
            "id": a.id,
            "userId": a.user_id,
            "deviceId": a.device_id,
            "message": a.message or "EMERGENCY!",
            "location": {"lat": a.latitude, "lon": a.longitude},
            "batteryLevel": a.battery_level if a.battery_level is not None else 100,
            "timestamp": a.created_at.isoformat() if a.created_at else None,
            "resolved": (a.status == "RESOLVED")
        })
    return sos_items

@router.post("/sos/{sos_id}/resolve")
async def resolve_sos_alert(sos_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SOSAlert).where(SOSAlert.id == sos_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="SOS alert not found")
    alert.status = "RESOLVED"
    await db.flush()
    return {"message": "SOS alert resolved successfully", "id": sos_id}
