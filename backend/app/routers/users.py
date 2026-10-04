from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.database import get_db
from app.models.user import User
from app.models.public_key import PublicKey
from app.schemas.user import UserResponse, UserListResponse, PublicUserResponse
from app.middleware.auth import get_current_user
from app.utils.ids import normalize_bs_id
from app.websocket.manager import manager

router = APIRouter()

class PublicKeyUpload(BaseModel):
    public_key: str
    key_type: str = "x25519"

class PublicKeyResponse(BaseModel):
    user_id: str
    public_key: str
    key_type: str


async def to_public_user(db: AsyncSession, user: User) -> PublicUserResponse:
    pk_result = await db.execute(select(PublicKey.public_key).where(PublicKey.user_id == user.id))
    return PublicUserResponse(
        id=user.id,
        bs_id=user.bs_id,
        username=user.username,
        display_name=user.display_name,
        public_key=pk_result.scalar_one_or_none(),
        is_online=manager.is_online(user.id),
    )


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


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.get("/lookup/{bs_id}", response_model=PublicUserResponse)
async def lookup_user(
    bs_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Find a user by their exact BartaSetu ID (e.g. BS-7K3Q9X)."""
    result = await db.execute(select(User).where(User.bs_id == normalize_bs_id(bs_id), User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="No user with that BartaSetu ID")
    return await to_public_user(db, user)


@router.get("/search", response_model=list[PublicUserResponse])
async def search_users(
    q: str = Query(..., min_length=2, max_length=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Prefix search by BartaSetu ID or username, for live search while typing."""
    term = q.strip()
    id_prefix = normalize_bs_id(term)
    result = await db.execute(
        select(User)
        .where(
            User.is_active == True,
            User.id != current_user.id,
            or_(User.bs_id.like(f"{id_prefix}%"), User.username.like(f"{term.lower()}%")),
        )
        .order_by(User.username)
        .limit(20)
    )
    return [await to_public_user(db, u) for u in result.scalars().all()]


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


@router.get("/{user_id}", response_model=PublicUserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await to_public_user(db, user)
