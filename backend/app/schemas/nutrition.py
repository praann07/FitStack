import uuid
from datetime import date

from pydantic import BaseModel

from app.schemas.common import Confidence, MealType, TargetSource


class FoodOut(BaseModel):
    id: uuid.UUID
    name: str
    brand: str | None
    calories_per_100g: float | None
    protein_per_100g: float | None
    carbs_per_100g: float | None
    fat_per_100g: float | None
    serving_label: str | None
    serving_g: float | None
    is_custom: bool
    created_by: uuid.UUID | None

    model_config = {"from_attributes": True}


class FoodCreate(BaseModel):
    name: str
    brand: str | None = None
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    serving_label: str | None = None
    serving_g: float | None = None


class Macros(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


class FoodLogOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    food_id: uuid.UUID
    log_date: date
    quantity_g: float
    meal_type: MealType

    model_config = {"from_attributes": True}


class FoodLogEntryOut(FoodLogOut):
    food: FoodOut
    macros: Macros


class LogFoodPayload(BaseModel):
    food_id: uuid.UUID
    log_date: date
    quantity_g: float
    meal_type: MealType


class UpdateLogPayload(BaseModel):
    quantity_g: float | None = None
    meal_type: MealType | None = None


class CopyDayPayload(BaseModel):
    from_date: date
    to_date: date


class MealBucket(BaseModel):
    entries: list[FoodLogEntryOut]
    totals: Macros


class NutritionDayOut(BaseModel):
    date: date
    entries: list[FoodLogEntryOut]
    totals: Macros
    target: "NutritionTargetOut | None"
    by_meal: dict[str, MealBucket]


class NutritionTargetOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    effective_date: date
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    source: TargetSource

    model_config = {"from_attributes": True}


class ManualTargetPayload(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


class TdeeEstimateOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    estimate_date: date
    estimated_tdee: int
    weight_trend_kg: float | None
    confidence: Confidence | None

    model_config = {"from_attributes": True}


class MacroSuggestionOut(BaseModel):
    id: str
    created_date: date
    calorie_delta: int
    reason: str
    detail: str
    actual_rate_kg_week: float
    goal_rate_kg_week: float
    deviation_pct: int
    weeks_deviating: int
    proposed: Macros
    current: Macros


class RecomputeResult(BaseModel):
    tdee: TdeeEstimateOut | None
    suggestion: MacroSuggestionOut | None
    message: str


class DismissSuggestionPayload(BaseModel):
    suggestion_id: str


NutritionDayOut.model_rebuild()
