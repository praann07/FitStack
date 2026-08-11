import uuid

from pydantic import BaseModel

from app.schemas.common import Equipment, MuscleGroup


class ExerciseOut(BaseModel):
    id: uuid.UUID
    name: str
    muscle_group: MuscleGroup
    equipment: Equipment | None
    is_custom: bool
    created_by: uuid.UUID | None

    model_config = {"from_attributes": True}


class ExerciseCreate(BaseModel):
    name: str
    muscle_group: MuscleGroup
    equipment: Equipment | None = None
