import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.exercise import Exercise
from app.models.routine import Routine, RoutineExercise
from app.models.user import User
from app.models.workout import WorkoutSession
from app.schemas.routine import RoutineDetailOut, RoutineInput

router = APIRouter(prefix="/routines", tags=["routines"])


def _detail(db: Session, routine: Routine) -> RoutineDetailOut:
    rows = (
        db.query(RoutineExercise, Exercise)
        .join(Exercise, Exercise.id == RoutineExercise.exercise_id)
        .filter(RoutineExercise.routine_id == routine.id)
        .order_by(RoutineExercise.order_index)
        .all()
    )
    exercises = []
    for rex, exercise in rows:
        exercises.append(
            {
                "id": rex.id,
                "routine_id": rex.routine_id,
                "exercise_id": rex.exercise_id,
                "order_index": rex.order_index,
                "target_sets": rex.target_sets,
                "target_rep_range": rex.target_rep_range,
                "target_rpe": rex.target_rpe,
                "rest_seconds": rex.rest_seconds,
                "notes": rex.notes,
                "exercise": exercise,
            }
        )
    return RoutineDetailOut.model_validate({**routine.__dict__, "exercises": exercises})


def _get_owned(db: Session, routine_id: uuid.UUID, user_id: uuid.UUID) -> Routine:
    routine = (
        db.query(Routine).filter(Routine.id == routine_id, Routine.user_id == user_id).first()
    )
    if routine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine not found.")
    return routine


@router.get("", response_model=list[RoutineDetailOut])
def list_routines(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    routines = (
        db.query(Routine)
        .filter(Routine.user_id == current_user.id)
        .order_by(Routine.updated_at.desc())
        .all()
    )
    return [_detail(db, r) for r in routines]


@router.get("/{routine_id}", response_model=RoutineDetailOut)
def get_routine(
    routine_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    routine = _get_owned(db, routine_id, current_user.id)
    return _detail(db, routine)


@router.post("", response_model=RoutineDetailOut, status_code=status.HTTP_201_CREATED)
def create_routine(
    payload: RoutineInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    routine = Routine(user_id=current_user.id, name=payload.name.strip(), notes=payload.notes)
    db.add(routine)
    db.flush()

    for index, ex in enumerate(payload.exercises):
        db.add(
            RoutineExercise(
                routine_id=routine.id,
                exercise_id=ex.exercise_id,
                order_index=index,
                target_sets=ex.target_sets,
                target_rep_range=ex.target_rep_range,
                target_rpe=ex.target_rpe,
                rest_seconds=ex.rest_seconds,
                notes=ex.notes,
            )
        )
    db.commit()
    db.refresh(routine)
    return _detail(db, routine)


@router.put("/{routine_id}", response_model=RoutineDetailOut)
def update_routine(
    routine_id: uuid.UUID,
    payload: RoutineInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    routine = _get_owned(db, routine_id, current_user.id)
    routine.name = payload.name.strip()
    routine.notes = payload.notes
    routine.updated_at = datetime.now(timezone.utc)

    db.query(RoutineExercise).filter(RoutineExercise.routine_id == routine.id).delete()
    for index, ex in enumerate(payload.exercises):
        db.add(
            RoutineExercise(
                routine_id=routine.id,
                exercise_id=ex.exercise_id,
                order_index=index,
                target_sets=ex.target_sets,
                target_rep_range=ex.target_rep_range,
                target_rpe=ex.target_rpe,
                rest_seconds=ex.rest_seconds,
                notes=ex.notes,
            )
        )
    db.commit()
    db.refresh(routine)
    return _detail(db, routine)


@router.delete("/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(
    routine_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    routine = _get_owned(db, routine_id, current_user.id)
    # History keeps its sessions — reference nulled, not cascade-deleted.
    db.query(WorkoutSession).filter(WorkoutSession.routine_id == routine.id).update(
        {WorkoutSession.routine_id: None}
    )
    db.query(RoutineExercise).filter(RoutineExercise.routine_id == routine.id).delete()
    db.delete(routine)
    db.commit()
