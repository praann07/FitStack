import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import func

from app.core.database import Base


class Food(Base):
    __tablename__ = "foods"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(150))
    calories_per_100g: Mapped[float | None] = mapped_column(Numeric(6, 2, asdecimal=False))
    protein_per_100g: Mapped[float | None] = mapped_column(Numeric(6, 2, asdecimal=False))
    carbs_per_100g: Mapped[float | None] = mapped_column(Numeric(6, 2, asdecimal=False))
    fat_per_100g: Mapped[float | None] = mapped_column(Numeric(6, 2, asdecimal=False))
    # Convenience portion, e.g. "1 medium (118 g)" — display only.
    serving_label: Mapped[str | None] = mapped_column(String(50))
    serving_g: Mapped[float | None] = mapped_column(Numeric(6, 1, asdecimal=False))
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )


class FoodLog(Base):
    __tablename__ = "food_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    food_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("foods.id"))
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity_g: Mapped[float] = mapped_column(Numeric(7, 2, asdecimal=False), nullable=False)
    meal_type: Mapped[str | None] = mapped_column(String(20))  # breakfast|lunch|dinner|snack


class NutritionTarget(Base):
    __tablename__ = "nutrition_targets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    calories: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_g: Mapped[int] = mapped_column(Integer, nullable=False)
    carbs_g: Mapped[int] = mapped_column(Integer, nullable=False)
    fat_g: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="adaptive")  # adaptive|manual


class TdeeEstimate(Base):
    __tablename__ = "tdee_estimates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    estimate_date: Mapped[date] = mapped_column(Date, nullable=False)
    estimated_tdee: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_trend_kg: Mapped[float | None] = mapped_column(Numeric(5, 2, asdecimal=False))
    confidence: Mapped[str | None] = mapped_column(String(10))  # low|medium|high


class DismissedSuggestion(Base):
    """Tracks which deterministic macro-suggestion ids a user has dismissed
    (system design §7 — suggestions can be accepted or dismissed)."""

    __tablename__ = "dismissed_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    suggestion_id: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
