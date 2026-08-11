import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.exercise import ExerciseOut


class RoutineExerciseIn(BaseModel):
    exercise_id: uuid.UUID
    target_sets: int
    target_rep_range: str
    target_rpe: float | None = None
    rest_seconds: int = 90
    notes: str | None = None


class RoutineExerciseOut(BaseModel):
    id: uuid.UUID
    routine_id: uuid.UUID
    exercise_id: uuid.UUID
    order_index: int
    target_sets: int
    target_rep_range: str
    target_rpe: float | None
    rest_seconds: int
    notes: str | None
    exercise: ExerciseOut

    model_config = {"from_attributes": True}


class RoutineOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RoutineDetailOut(RoutineOut):
    exercises: list[RoutineExerciseOut]


class RoutineInput(BaseModel):
    name: str
    notes: str | None = None
    exercises: list[RoutineExerciseIn]
