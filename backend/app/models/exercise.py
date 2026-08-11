import uuid

from sqlalchemy import Boolean, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    muscle_group: Mapped[str] = mapped_column(String(50), nullable=False)
    equipment: Mapped[str | None] = mapped_column(String(50))
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
