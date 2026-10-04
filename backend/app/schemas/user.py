from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    display_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    bs_id: Optional[str] = None
    username: str
    email: str
    display_name: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int

class PublicUserResponse(BaseModel):
    """Profile visible to other users: no email or account details."""
    id: str
    bs_id: Optional[str] = None
    username: str
    display_name: Optional[str] = None
    public_key: Optional[str] = None
    is_online: bool = False
