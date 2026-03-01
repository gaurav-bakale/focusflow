from pydantic import BaseModel, EmailStr
from typing import Optional


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None


class UserInDB(BaseModel):
    id: Optional[str] = None
    email: EmailStr
    hashed_password: str
    full_name: Optional[str] = None
