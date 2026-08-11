import uuid
from datetime import date

from pydantic import BaseModel


class BodyMetricOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    log_date: date
    weight_kg: float | None
    waist_cm: float | None
    chest_cm: float | None
    arm_cm: float | None
    photo_url: str | None

    model_config = {"from_attributes": True}


class MetricPayload(BaseModel):
    log_date: date
    weight_kg: float | None = None
    waist_cm: float | None = None
    chest_cm: float | None = None
    arm_cm: float | None = None
    photo_url: str | None = None


class TrendPointOut(BaseModel):
    date: date
    weight_kg: float | None
    trend_kg: float | None
    calories: int | None
    volume_kg: float | None


class WeeklyVolumeSlim(BaseModel):
    week_start: date
    volume_kg: float


class ProgressTrendOut(BaseModel):
    points: list[TrendPointOut]
    current_trend_kg: float | None
    rate_kg_week: float | None
    total_change_kg: float | None
    weekly_volume: list[WeeklyVolumeSlim]
