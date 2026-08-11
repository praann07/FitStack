import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.exercise import Exercise
from app.models.user import User
from app.schemas.common import MuscleGroup
from app.schemas.exercise import ExerciseCreate, ExerciseOut
from app.schemas.workout import ExerciseHistoryPointOut, LastPerformanceOut, PlateauStatusOut
from app.services import derive

router = APIRouter(prefix="/exercises", tags=["exercises"])


def _visible(query, user_id: uuid.UUID):
    return query.filter(or_(Exercise.created_by.is_(None), Exercise.created_by == user_id))


@router.get("", response_model=list[ExerciseOut])
def list_exercises(
    muscle_group: MuscleGroup | None = None,
    search: str | None = None,
    trained: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = _visible(db.query(Exercise), current_user.id)
    if muscle_group:
        query = query.filter(Exercise.muscle_group == muscle_group)
    if search:
        query = query.filter(Exercise.name.ilike(f"%{search.strip()}%"))
    if trained:
        trained_ids = {s.exercise_id for s in derive.user_sets(db, current_user.id)}
        if not trained_ids:
            return []
        query = query.filter(Exercise.id.in_(trained_ids))
    return query.order_by(Exercise.name).all()


@router.get("/plateau-status", response_model=list[PlateauStatusOut])
def all_plateaus(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return derive.build_all_plateaus(db, current_user.id)


@router.get("/{exercise_id}/history", response_model=list[ExerciseHistoryPointOut])
def exercise_history(
    exercise_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return derive.build_exercise_history(db, current_user.id, exercise_id)


@router.get("/{exercise_id}/plateau-status", response_model=PlateauStatusOut | None)
def plateau_status(
    exercise_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return derive.build_plateau_status(db, current_user.id, exercise_id)


@router.get("/{exercise_id}/last", response_model=LastPerformanceOut | None)
def last_performance(
    exercise_id: uuid.UUID,
    exclude_session_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for session in derive.user_sessions(db, current_user.id):
        if session.id == exclude_session_id:
            continue
        sets = [s for s in derive.session_sets(db, session.id) if s.exercise_id == exercise_id]
        if sets:
            return {"date": session.session_date, "sets": sets}
    return None


@router.post("", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
def create_exercise(
    payload: ExerciseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    clash = (
        _visible(db.query(Exercise), current_user.id)
        .filter(Exercise.name.ilike(name))
        .first()
    )
    if clash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="You already have an exercise with that name."
        )
    exercise = Exercise(
        name=name,
        muscle_group=payload.muscle_group,
        equipment=payload.equipment,
        is_custom=True,
        created_by=current_user.id,
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise
