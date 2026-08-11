from datetime import date

from pydantic import BaseModel

from app.schemas.common import Goal
from app.schemas.nutrition import Macros, MacroSuggestionOut, NutritionTargetOut, TdeeEstimateOut
from app.schemas.workout import PersonalRecordOut, PlateauStatusOut, SessionSummaryOut


class TodaySummary(BaseModel):
    date: date
    totals: Macros
    target: NutritionTargetOut | None
    logged_entries: int


class TrainingSummary(BaseModel):
    week_start: date
    sessions_this_week: int
    planned_sessions: int
    volume_this_week_kg: float
    volume_last_week_kg: float
    sets_by_muscle_group: dict[str, int]
    last_session: SessionSummaryOut | None


class BodySummary(BaseModel):
    current_trend_kg: float | None
    rate_kg_week: float | None
    goal_rate_kg_week: float
    goal: Goal
    last_logged_date: date | None
    days_since_weigh_in: int | None


class DashboardSummaryOut(BaseModel):
    today: TodaySummary
    training: TrainingSummary
    body: BodySummary
    tdee: TdeeEstimateOut | None
    recent_prs: list[PersonalRecordOut]
    plateaus: list[PlateauStatusOut]
    suggestion: MacroSuggestionOut | None
    streak_days: int
