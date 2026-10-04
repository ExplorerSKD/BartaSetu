from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse
from app.schemas.auth import Token, TokenRefresh
from app.utils.ids import generate_bs_id
from app.utils.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token

router = APIRouter()


async def assign_unique_bs_id(db: AsyncSession) -> str:
    for _ in range(20):
        candidate = generate_bs_id()
        result = await db.execute(select(User.id).where(User.bs_id == candidate))
        if result.scalar_one_or_none() is None:
            return candidate
    raise HTTPException(status_code=500, detail="Could not allocate a unique BartaSetu ID")


def issue_tokens(user: User) -> Token:
    return Token(
        access_token=create_access_token({"sub": user.id}),
        refresh_token=create_refresh_token({"sub": user.id}),
        user=UserResponse.model_validate(user),
    )


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    username = user_data.username.strip().lower()
    email = user_data.email.strip().lower()

    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        bs_id=await assign_unique_bs_id(db),
        username=username,
        email=email,
        password_hash=hash_password(user_data.password),
        display_name=(user_data.display_name or "").strip() or username,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    return issue_tokens(user)


@router.post("/login", response_model=Token)
async def login(login_data: UserLogin, db: AsyncSession = Depends(get_db)):
    identifier = login_data.username.strip().lower()
    result = await db.execute(
        select(User).where(or_(User.username == identifier, User.email == identifier))
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not user.bs_id:
        user.bs_id = await assign_unique_bs_id(db)
        await db.flush()

    return issue_tokens(user)


@router.post("/refresh", response_model=Token)
async def refresh_token(token_data: TokenRefresh, db: AsyncSession = Depends(get_db)):
    payload = decode_token(token_data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return issue_tokens(user)
