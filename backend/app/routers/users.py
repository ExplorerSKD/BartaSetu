from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.user import User
from app.models.public_key import PublicKey
from app.schemas.user import UserResponse, UserListResponse
from app.middleware.auth import get_current_user

router = APIRouter()

class PublicKeyUpload(BaseModel):
    public_key: str
    key_type: str = "x25519"

class PublicKeyResponse(BaseModel):
    user_id: str
    public_key: str
    key_type: str

@router.get("", response_model=UserListResponse)
async def get_users(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(User).where(User.is_active == True).offset(skip).limit(limit))
    users = result.scalars().all()
    count_result = await db.execute(select(func.count()).select_from(User).where(User.is_active == True))
    total = count_result.scalar()
    return UserListResponse(users=[UserResponse.model_validate(u) for u in users], total=total)

@router.post("/public-key", response_model=PublicKeyResponse)
async def upload_public_key(
    data: PublicKeyUpload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Upsert public key
    result = await db.execute(select(PublicKey).where(PublicKey.user_id == current_user.id))
    existing = result.scalar_one_or_none()
    if existing:
        existing.public_key = data.public_key
        existing.key_type = data.key_type
    else:
        new_key = PublicKey(
            user_id=current_user.id,
            public_key=data.public_key,
            key_type=data.key_type
        )
        db.add(new_key)
    await db.flush()
    return PublicKeyResponse(
        user_id=current_user.id,
        public_key=data.public_key,
        key_type=data.key_type
    )

@router.get("/{user_id}/public-key", response_model=PublicKeyResponse)
async def get_public_key(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(PublicKey).where(PublicKey.user_id == user_id))
    pk = result.scalar_one_or_none()
    if not pk:
        raise HTTPException(status_code=404, detail="Public key not found for user")
    return PublicKeyResponse(
        user_id=user_id,
        public_key=pk.public_key,
        key_type=pk.key_type
    )

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.model_validate(user)
