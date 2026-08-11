import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Routine(Base):
    __tablename__ = "routines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class RoutineExercise(Base):
    __tablename__ = "routine_exercises"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    routine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("routines.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exercises.id")
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    target_sets: Mapped[int | None] = mapped_column(Integer)
    target_rep_range: Mapped[str | None] = mapped_column(String(20))
    target_rpe: Mapped[float | None] = mapped_column(Numeric(3, 1, asdecimal=False))
    rest_seconds: Mapped[int] = mapped_column(Integer, default=90)
    notes: Mapped[str | None] = mapped_column(Text)
