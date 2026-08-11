import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import func

from app.core.database import Base


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    routine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("routines.id")
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None]
    ended_at: Mapped[datetime | None]


class WorkoutSet(Base):
    __tablename__ = "workout_sets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exercises.id")
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[float | None] = mapped_column(Numeric(6, 2, asdecimal=False))
    reps: Mapped[int | None] = mapped_column(Integer)
    rpe: Mapped[float | None] = mapped_column(Numeric(3, 1, asdecimal=False))
    set_type: Mapped[str] = mapped_column(String(10), default="normal")  # warmup|normal|drop|failure
    notes: Mapped[str | None] = mapped_column(Text)
    is_pr: Mapped[bool] = mapped_column(Boolean, default=False)
