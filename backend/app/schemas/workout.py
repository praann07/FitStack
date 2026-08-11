import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import MuscleGroup, SetType
from app.schemas.exercise import ExerciseOut


class WorkoutSetOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    exercise_id: uuid.UUID
    set_number: int
    weight_kg: float | None
    reps: int | None
    rpe: float | None
    set_type: SetType
    notes: str | None
    is_pr: bool

    model_config = {"from_attributes": True}


class LogSetPayload(BaseModel):
    exercise_id: uuid.UUID
    weight_kg: float
    reps: int
    rpe: float | None = None
    set_type: SetType = "normal"
    notes: str | None = None


class UpdateSetPayload(BaseModel):
    weight_kg: float | None = None
    reps: int | None = None
    rpe: float | None = None
    set_type: SetType | None = None
    notes: str | None = None


class SessionExerciseGroup(BaseModel):
    exercise: ExerciseOut
    sets: list[WorkoutSetOut]
    volume_kg: float
    top_set: WorkoutSetOut | None


class SessionDetailOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    routine_id: uuid.UUID | None
    session_date: date
    notes: str | None
    started_at: datetime | None
    ended_at: datetime | None
    routine_name: str | None
    groups: list[SessionExerciseGroup]
    total_volume_kg: float
    total_sets: int
    pr_count: int
    duration_minutes: int | None


class SessionSummaryOut(BaseModel):
    id: uuid.UUID
    session_date: date
    routine_name: str | None
    title: str
    duration_minutes: int | None
    total_volume_kg: float
    total_sets: int
    pr_count: int
    exercise_count: int
    muscle_groups: list[MuscleGroup]


class StartSessionPayload(BaseModel):
    routine_id: uuid.UUID | None = None


class CompleteSessionPayload(BaseModel):
    notes: str | None = None


class ExerciseHistoryPointOut(BaseModel):
    session_id: uuid.UUID
    date: date
    best_weight_kg: float | None
    best_reps: int | None
    estimated_1rm: float
    volume_kg: float
    is_pr: bool


class PlateauStatusOut(BaseModel):
    exercise_id: uuid.UUID
    exercise_name: str
    is_plateaued: bool
    sessions_analysed: int
    sessions_since_improvement: int
    best_estimated_1rm: float
    current_estimated_1rm: float
    last_improvement_date: date | None


class WeeklyVolumePointOut(BaseModel):
    week_start: date
    label: str
    total_volume_kg: float
    by_muscle_group: dict[str, float]
    sets_by_muscle_group: dict[str, int]
    sessions: int


class LogSetResult(BaseModel):
    set: WorkoutSetOut
    is_pr: bool


class LastPerformanceOut(BaseModel):
    date: date
    sets: list[WorkoutSetOut]


class PersonalRecordOut(BaseModel):
    set_id: uuid.UUID
    session_id: uuid.UUID
    date: date
    exercise_id: uuid.UUID
    exercise_name: str
    muscle_group: MuscleGroup
    weight_kg: float | None
    reps: int | None
    estimated_1rm: float
