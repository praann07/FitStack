import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Numeric, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import func

from app.core.database import Base


class BodyMetric(Base):
    __tablename__ = "body_metrics"
    __table_args__ = (UniqueConstraint("user_id", "log_date"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    weight_kg: Mapped[float | None] = mapped_column(Numeric(5, 2, asdecimal=False))
    waist_cm: Mapped[float | None] = mapped_column(Numeric(5, 1, asdecimal=False))
    chest_cm: Mapped[float | None] = mapped_column(Numeric(5, 1, asdecimal=False))
    arm_cm: Mapped[float | None] = mapped_column(Numeric(5, 1, asdecimal=False))
    photo_url: Mapped[str | None] = mapped_column(Text)
