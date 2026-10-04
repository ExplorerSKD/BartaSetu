from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from datetime import datetime, timezone
from app.database import get_db
from app.models.message import Message
from app.models.message_route import MessageRoute
from app.models.delivery_receipt import DeliveryReceipt
from app.models.user import User
from app.schemas.message import MessageCreate, MessageResponse, MessageSyncRequest, MessageAck
from app.middleware.auth import get_current_user
from app.websocket.manager import manager

router = APIRouter()

@router.post("", response_model=MessageResponse, status_code=201)
async def create_message(
    message_data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check for duplicate
    result = await db.execute(select(Message).where(Message.id == message_data.id))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Message already exists")
    
    message = Message(
        id=message_data.id,
        sender_id=current_user.id,
        recipient_id=message_data.recipient_id,
        encrypted_content=message_data.encrypted_content,
        encrypted_key=message_data.encrypted_key,
        iv=message_data.iv,
        content_type=message_data.content_type,
        priority=message_data.priority,
        status="SERVER_RECEIVED",
        hop_count=message_data.hop_count,
        max_hops=message_data.max_hops,
        ttl=message_data.ttl,
        expires_at=message_data.expires_at,
        created_at=message_data.created_at,
        gateway_device_id=message_data.gateway_device_id
    )
    db.add(message)
    
    # Store route info if provided
    if message_data.route:
        for hop in message_data.route:
            route = MessageRoute(
                message_id=message.id,
                device_id=hop.get("device_id", ""),
                hop_number=hop.get("hop_number", 0),
                action=hop.get("action", "RELAY")
            )
            db.add(route)
    
    await db.flush()
    
    # Try to deliver via WebSocket
    delivered = await manager.send_to_user(
        message_data.recipient_id,
        {
            "type": "new_message",
            "message": MessageResponse.model_validate(message).model_dump(mode="json")
        }
    )
    
    if delivered:
        message.status = "DELIVERED"
        await db.flush()
    
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
    messages = result.scalars().all()
    return [MessageResponse.model_validate(m) for m in messages]

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

@router.post("/sync", response_model=list[MessageResponse])
async def sync_messages(
    sync_data: MessageSyncRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    results = []
    for msg_data in sync_data.messages:
        # Skip duplicates
        existing = await db.execute(select(Message).where(Message.id == msg_data.id))
        if existing.scalar_one_or_none():
            continue
        
        message = Message(
            id=msg_data.id,
            sender_id=current_user.id,
            recipient_id=msg_data.recipient_id,
            encrypted_content=msg_data.encrypted_content,
            encrypted_key=msg_data.encrypted_key,
            iv=msg_data.iv,
            content_type=msg_data.content_type,
            priority=msg_data.priority,
            status="SERVER_RECEIVED",
            hop_count=msg_data.hop_count,
            max_hops=msg_data.max_hops,
            ttl=msg_data.ttl,
            expires_at=msg_data.expires_at,
            created_at=msg_data.created_at,
            gateway_device_id=msg_data.gateway_device_id
        )
        db.add(message)
        await db.flush()
        
        # Try WebSocket delivery
        delivered = await manager.send_to_user(
            msg_data.recipient_id,
            {"type": "new_message", "message": MessageResponse.model_validate(message).model_dump(mode="json")}
        )
        if delivered:
            message.status = "DELIVERED"
            await db.flush()
        
        results.append(MessageResponse.model_validate(message))
    
    return results

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
    
    message.status = ack_data.status
    
    receipt = DeliveryReceipt(
        message_id=message_id,
        recipient_id=current_user.id,
        status=ack_data.status
    )
    db.add(receipt)
    await db.flush()
    
    # Notify sender via WebSocket
    await manager.send_to_user(
        message.sender_id,
        {"type": "delivery_ack", "message_id": message_id, "status": ack_data.status}
    )
    
    return {"message": "Acknowledged", "status": ack_data.status}
