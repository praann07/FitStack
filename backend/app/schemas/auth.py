import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None
    goal: Literal["bulk", "cut", "maintain"]
    goal_rate_kg_week: float
    height_cm: float
    # Used once, at signup, to seed the first body_metrics row and a
    # Mifflin-St Jeor baseline nutrition_targets row (system design §10 —
    # new user, insufficient history). Not persisted on the user record.
    weight_kg: float
    age: int = Field(ge=13, le=100)
    sex: Literal["male", "female"]
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    goal: str
    goal_rate_kg_week: float | None
    height_cm: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    goal: Literal["bulk", "cut", "maintain"] | None = None
    goal_rate_kg_week: float | None = None
    height_cm: float | None = None
