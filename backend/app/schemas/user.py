from datetime import datetime
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole, UnitSystem


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = UserRole.user


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    unit_system: str | None = None
    preferred_language: str | None = None


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    username: str
    email: str
    role: str
    is_active: bool
    totp_enabled: bool
    unit_system: str
    preferred_language: str
    created_at: datetime


class SignupRequestCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    message: str | None = None


class SignupRequestOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    username: str
    email: str
    message: str | None
    status: str
    created_at: datetime
