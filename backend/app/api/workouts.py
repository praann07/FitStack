import time
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.workout import WorkoutSession, WorkoutSet
from app.schemas.workout import (
    CompleteSessionPayload,
    LogSetPayload,
    LogSetResult,
    PersonalRecordOut,
    SessionDetailOut,
    SessionSummaryOut,
    StartSessionPayload,
    UpdateSetPayload,
    WeeklyVolumePointOut,
    WorkoutSetOut,
)
from app.services import derive

router = APIRouter(prefix="/workouts", tags=["workouts"])
volume_router = APIRouter(prefix="/volume", tags=["workouts"])

# Guards against double-tap duplicate set submissions (system design §10).
_recent_submissions: dict[str, float] = {}
_DUPLICATE_WINDOW_SECONDS = 2.5


def _owned_session(db: Session, session_id: uuid.UUID, user_id: uuid.UUID) -> WorkoutSession:
    session = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found.")
    return session


@router.post("", response_model=SessionDetailOut, status_code=status.HTTP_201_CREATED)
def start_session(
    payload: StartSessionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    active = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.is_(None))
        .first()
    )
    if active is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="You already have a workout in progress."
        )
    session = WorkoutSession(
        user_id=current_user.id,
        routine_id=payload.routine_id,
        session_date=date.today(),
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return derive.build_session_detail(db, session)


@router.get("/active", response_model=SessionDetailOut | None)
def get_active_session(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    session = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.is_(None))
        .first()
    )
    return derive.build_session_detail(db, session) if session else None


@router.get("/prs", response_model=list[PersonalRecordOut])
def recent_prs(
    limit: int = 8,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return derive.build_recent_prs(db, current_user.id, limit)


@router.get("", response_model=list[SessionSummaryOut])
def list_sessions(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == current_user.id, WorkoutSession.ended_at.isnot(None)
    )
    if date_from:
        query = query.filter(WorkoutSession.session_date >= date_from)
    if date_to:
        query = query.filter(WorkoutSession.session_date <= date_to)
    sessions = query.order_by(WorkoutSession.session_date.desc()).limit(limit).all()
    return [derive.build_session_summary(db, s) for s in sessions]


@router.get("/{session_id}", response_model=SessionDetailOut)
def get_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _owned_session(db, session_id, current_user.id)
    return derive.build_session_detail(db, session)


@router.patch("/{session_id}/complete", response_model=SessionDetailOut)
def complete_session(
    session_id: uuid.UUID,
    payload: CompleteSessionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _owned_session(db, session_id, current_user.id)
    if not derive.session_sets(db, session.id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Log at least one set before finishing this workout.",
        )
    session.ended_at = datetime.now(timezone.utc)
    session.notes = payload.notes
    db.commit()
    db.refresh(session)
    return derive.build_session_detail(db, session)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_session(db, session_id, current_user.id)
    db.query(WorkoutSession).filter(WorkoutSession.id == session_id).delete()  # cascades to sets
    db.commit()
    derive.recompute_prs(db, current_user.id)
    db.commit()


@router.post("/{session_id}/sets", response_model=LogSetResult, status_code=status.HTTP_201_CREATED)
def log_set(
    session_id: uuid.UUID,
    payload: LogSetPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    signature = f"{session_id}:{payload.exercise_id}:{payload.weight_kg}:{payload.reps}:{payload.set_type}"
    now = time.monotonic()
    last = _recent_submissions.get(signature)
    if last is not None and now - last < _DUPLICATE_WINDOW_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That exact set was just logged — check the list before adding it again.",
        )
    _recent_submissions[signature] = now

    session = _owned_session(db, session_id, current_user.id)
    if session.ended_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This workout is already finished.")

    existing_count = (
        db.query(WorkoutSet)
        .filter(WorkoutSet.session_id == session_id, WorkoutSet.exercise_id == payload.exercise_id)
        .count()
    )
    workout_set = WorkoutSet(
        session_id=session_id,
        exercise_id=payload.exercise_id,
        set_number=existing_count + 1,
        weight_kg=payload.weight_kg,
        reps=payload.reps,
        rpe=payload.rpe,
        set_type=payload.set_type,
        notes=payload.notes,
        is_pr=False,
    )
    db.add(workout_set)
    db.commit()

    derive.recompute_prs(db, current_user.id)
    db.commit()
    db.refresh(workout_set)
    return {"set": workout_set, "is_pr": workout_set.is_pr}


@router.patch("/{session_id}/sets/{set_id}", response_model=WorkoutSetOut)
def update_set(
    session_id: uuid.UUID,
    set_id: uuid.UUID,
    payload: UpdateSetPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_session(db, session_id, current_user.id)
    workout_set = (
        db.query(WorkoutSet)
        .filter(WorkoutSet.id == set_id, WorkoutSet.session_id == session_id)
        .first()
    )
    if workout_set is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(workout_set, field, value)
    db.commit()

    derive.recompute_prs(db, current_user.id)
    db.commit()
    db.refresh(workout_set)
    return workout_set


@router.delete("/{session_id}/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(
    session_id: uuid.UUID,
    set_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_session(db, session_id, current_user.id)
    target = db.query(WorkoutSet).filter(WorkoutSet.id == set_id).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set not found.")

    exercise_id = target.exercise_id
    db.delete(target)
    db.flush()

    remaining = (
        db.query(WorkoutSet)
        .filter(WorkoutSet.session_id == session_id, WorkoutSet.exercise_id == exercise_id)
        .order_by(WorkoutSet.set_number)
        .all()
    )
    for i, s in enumerate(remaining):
        s.set_number = i + 1
    db.commit()

    derive.recompute_prs(db, current_user.id)
    db.commit()


@volume_router.get("/weekly", response_model=list[WeeklyVolumePointOut])
def weekly_volume(
    weeks: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return derive.build_weekly_volume(db, current_user.id, weeks)
