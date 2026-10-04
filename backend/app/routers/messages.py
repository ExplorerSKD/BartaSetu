from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.database import get_db
from app.models.message import Message
from app.models.message_route import MessageRoute
from app.models.delivery_receipt import DeliveryReceipt
from app.models.user import User
from app.schemas.message import (
    MessageCreate,
    MessageResponse,
    MessageSyncRequest,
    MessageAck,
    RelayedAckRequest,
    MessageStatusResponse,
)
from app.middleware.auth import get_current_user
from app.websocket.manager import manager

router = APIRouter()

FINAL_STATUSES = ("DELIVERED", "READ")


async def user_exists(db: AsyncSession, user_id: str) -> bool:
    result = await db.execute(select(User.id).where(User.id == user_id))
    return result.scalar_one_or_none() is not None


async def store_message(db: AsyncSession, data: MessageCreate, sender_id: str, uploader: User) -> Message:
    """Persist a message, its route audit trail, and push it to the recipient if they are online."""
    message = Message(
        id=data.id,
        sender_id=sender_id,
        recipient_id=data.recipient_id,
        encrypted_content=data.encrypted_content,
        encrypted_key=data.encrypted_key,
        iv=data.iv,
        content_type=data.content_type,
        priority=data.priority,
        status="SERVER_RECEIVED",
        hop_count=data.hop_count,
        max_hops=data.max_hops,
        ttl=data.ttl,
        expires_at=data.expires_at,
        created_at=data.created_at,
        gateway_device_id=data.gateway_device_id,
    )
    db.add(message)
    await db.flush()  # the route rows reference this message

    hops = list(data.route or [])
    if uploader.id != sender_id:
        # The uploading phone acted as the internet gateway for this message
        hops.append({"device_id": uploader.id, "hop_number": data.hop_count, "action": "GATEWAY"})
    for hop in hops:
        db.add(MessageRoute(
            message_id=message.id,
            device_id=str(hop.get("device_id", ""))[:36],
            hop_number=int(hop.get("hop_number", 0)),
            action=str(hop.get("action", "RELAY"))[:20],
        ))

    await db.flush()

    # Real-time push. Status stays SERVER_RECEIVED until the recipient acknowledges.
    await manager.send_to_user(
        data.recipient_id,
        {"type": "new_message", "message": MessageResponse.model_validate(message).model_dump(mode="json")},
    )
    return message


async def apply_ack(db: AsyncSession, message: Message, recipient_id: str, ack_status: str) -> None:
    message.status = ack_status
    db.add(DeliveryReceipt(message_id=message.id, recipient_id=recipient_id, status=ack_status))
    await db.flush()
    await manager.send_to_user(
        message.sender_id,
        {"type": "delivery_ack", "message_id": message.id, "status": ack_status},
    )


@router.post("", response_model=MessageResponse, status_code=201)
async def create_message(
    message_data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Direct send from an online phone. The authenticated user is always the sender."""
    existing = await db.execute(select(Message).where(Message.id == message_data.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Message already exists")
    if not await user_exists(db, message_data.recipient_id):
        raise HTTPException(status_code=404, detail="Recipient not found")

    message = await store_message(db, message_data, current_user.id, current_user)
    return MessageResponse.model_validate(message)


@router.get("", response_model=list[MessageResponse])
async def get_messages(
    status_filter: str = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Message).where(
        or_(Message.sender_id == current_user.id, Message.recipient_id == current_user.id)
    )
    if status_filter:
        query = query.where(Message.status == status_filter)
    query = query.order_by(Message.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return [MessageResponse.model_validate(m) for m in result.scalars().all()]


@router.get("/inbox", response_model=list[MessageResponse])
async def get_inbox(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Messages addressed to me that I have not acknowledged yet (e.g. sent while I was offline)."""
    result = await db.execute(
        select(Message)
        .where(Message.recipient_id == current_user.id, Message.status.notin_(FINAL_STATUSES))
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    return [MessageResponse.model_validate(m) for m in result.scalars().all()]


@router.get("/status", response_model=list[MessageStatusResponse])
async def get_statuses(
    ids: str = Query(..., description="Comma-separated message ids"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lets a sender catch up on delivery status after being offline."""
    id_list = [i for i in ids.split(",") if i][:200]
    if not id_list:
        return []
    result = await db.execute(
        select(Message.id, Message.status).where(Message.id.in_(id_list), Message.sender_id == current_user.id)
    )
    return [MessageStatusResponse(id=row.id, status=row.status) for row in result.all()]


@router.post("/sync", response_model=list[MessageResponse])
async def sync_messages(
    sync_data: MessageSyncRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Batch upload from an internet gateway. Messages may have been written by other users and
    carried here through the BLE/Wi-Fi mesh, so the original sender_id is preserved.
    Already-known ids are returned as-is so retries are idempotent.
    """
    results = []
    for msg_data in sync_data.messages:
        existing = await db.execute(select(Message).where(Message.id == msg_data.id))
        known = existing.scalar_one_or_none()
        if known:
            results.append(MessageResponse.model_validate(known))
            continue

        sender_id = msg_data.sender_id or current_user.id
        if not await user_exists(db, sender_id) or not await user_exists(db, msg_data.recipient_id):
            continue

        message = await store_message(db, msg_data, sender_id, current_user)
        results.append(MessageResponse.model_validate(message))

    return results


@router.post("/acks")
async def sync_relayed_acks(
    data: RelayedAckRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delivery acks that travelled back through the mesh and were uploaded by a gateway."""
    applied = []
    for ack in data.acks:
        result = await db.execute(select(Message).where(Message.id == ack.message_id))
        message = result.scalar_one_or_none()
        if not message or message.recipient_id != ack.recipient_id:
            continue
        if message.status not in FINAL_STATUSES:
            await apply_ack(db, message, ack.recipient_id, ack.status)
        applied.append(ack.message_id)
    return {"applied": applied}


@router.get("/{message_id}", response_model=MessageResponse)
async def get_message(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.sender_id != current_user.id and message.recipient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return MessageResponse.model_validate(message)


@router.post("/{message_id}/ack")
async def acknowledge_message(
    message_id: str,
    ack_data: MessageAck,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.recipient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the recipient can acknowledge a message")

    await apply_ack(db, message, current_user.id, ack_data.status)
    return {"message": "Acknowledged", "status": ack_data.status}
