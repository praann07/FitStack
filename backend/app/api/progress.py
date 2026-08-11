import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.progress import BodyMetric
from app.models.user import User
from app.schemas.progress import BodyMetricOut, MetricPayload, ProgressTrendOut
from app.services import derive

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/metrics", response_model=list[BodyMetricOut])
def list_metrics(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(BodyMetric).filter(BodyMetric.user_id == current_user.id)
    if date_from:
        query = query.filter(BodyMetric.log_date >= date_from)
    if date_to:
        query = query.filter(BodyMetric.log_date <= date_to)
    return query.order_by(BodyMetric.log_date.desc()).all()


@router.post("/metrics", response_model=BodyMetricOut, status_code=status.HTTP_201_CREATED)
def save_metric(
    payload: MetricPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if all(v is None for v in (payload.weight_kg, payload.waist_cm, payload.chest_cm, payload.arm_cm)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter at least one measurement."
        )

    existing = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == current_user.id, BodyMetric.log_date == payload.log_date)
        .first()
    )
    if existing:
        for field, value in payload.model_dump(exclude={"log_date"}).items():
            if field == "photo_url" and value is None:
                continue
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing

    metric = BodyMetric(user_id=current_user.id, **payload.model_dump())
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


@router.delete("/metrics/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_metric(
    metric_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = (
        db.query(BodyMetric)
        .filter(BodyMetric.id == metric_id, BodyMetric.user_id == current_user.id)
        .delete()
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found.")
    db.commit()


@router.get("/trend", response_model=ProgressTrendOut)
def get_trend(
    days: int = 90,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return derive.build_trend(db, current_user.id, days)
