import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.nutrition import DismissedSuggestion, Food, FoodLog, NutritionTarget, TdeeEstimate
from app.models.user import User
from app.schemas.nutrition import (
    CopyDayPayload,
    DismissSuggestionPayload,
    FoodCreate,
    FoodLogOut,
    FoodOut,
    LogFoodPayload,
    ManualTargetPayload,
    MacroSuggestionOut,
    NutritionDayOut,
    NutritionTargetOut,
    RecomputeResult,
    TdeeEstimateOut,
    UpdateLogPayload,
)
from app.services import derive
from app.services.adaptive import macros_from_calories

router = APIRouter(tags=["nutrition"])


def _visible_foods(db: Session, user_id: uuid.UUID):
    return db.query(Food).filter(or_(Food.created_by.is_(None), Food.created_by == user_id))


# ---------------------------------------------------------------------------
# Foods
# ---------------------------------------------------------------------------


@router.get("/foods", response_model=list[FoodOut])
def search_foods(
    search: str | None = None,
    limit: int = 40,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = _visible_foods(db, current_user.id)
    if search:
        q = search.strip()
        query = query.filter(or_(Food.name.ilike(f"%{q}%"), Food.brand.ilike(f"%{q}%")))
    foods = query.all()
    foods.sort(key=lambda f: (not f.is_custom, f.name.lower()))
    return foods[:limit]


@router.get("/foods/frequent", response_model=list[FoodOut])
def frequent_foods(
    limit: int = 8,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = db.query(FoodLog).filter(FoodLog.user_id == current_user.id).all()
    counts: dict[uuid.UUID, int] = {}
    for log in logs:
        counts[log.food_id] = counts.get(log.food_id, 0) + 1
    top_ids = [fid for fid, _ in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]]
    if not top_ids:
        return []
    foods_by_id = {f.id: f for f in db.query(Food).filter(Food.id.in_(top_ids)).all()}
    return [foods_by_id[fid] for fid in top_ids if fid in foods_by_id]


@router.post("/foods", response_model=FoodOut, status_code=status.HTTP_201_CREATED)
def create_food(
    payload: FoodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    clash = _visible_foods(db, current_user.id).filter(Food.name.ilike(name)).first()
    if clash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A food with that name already exists."
        )
    food = Food(**{**payload.model_dump(), "name": name}, is_custom=True, created_by=current_user.id)
    db.add(food)
    db.commit()
    db.refresh(food)
    return food


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------


@router.get("/nutrition/logs", response_model=NutritionDayOut)
def get_day(
    log_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return derive.build_nutrition_day(db, current_user.id, log_date)


@router.post("/nutrition/logs", response_model=FoodLogOut, status_code=status.HTTP_201_CREATED)
def log_food(
    payload: LogFoodPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Visibility, not just existence — a bare db.get() would let a caller log
    # (and thereby read back the name and macros of) another user's custom food.
    if _visible_foods(db, current_user.id).filter(Food.id == payload.food_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That food no longer exists.")
    if payload.quantity_g <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Quantity must be greater than 0 g."
        )
    log = FoodLog(user_id=current_user.id, **payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.patch("/nutrition/logs/{log_id}", response_model=FoodLogOut)
def update_log(
    log_id: uuid.UUID,
    payload: UpdateLogPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = db.query(FoodLog).filter(FoodLog.id == log_id, FoodLog.user_id == current_user.id).first()
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found.")
    updates = payload.model_dump(exclude_unset=True)
    if "quantity_g" in updates and updates["quantity_g"] is not None and updates["quantity_g"] <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Quantity must be greater than 0 g."
        )
    for field, value in updates.items():
        setattr(log, field, value)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/nutrition/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(
    log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(FoodLog).filter(FoodLog.id == log_id, FoodLog.user_id == current_user.id).delete()
    db.commit()


@router.post("/nutrition/logs/copy", response_model=int)
def copy_day(
    payload: CopyDayPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    source = (
        db.query(FoodLog)
        .filter(FoodLog.user_id == current_user.id, FoodLog.log_date == payload.from_date)
        .all()
    )
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="That day has nothing logged to copy."
        )
    for log in source:
        db.add(
            FoodLog(
                user_id=current_user.id,
                food_id=log.food_id,
                log_date=payload.to_date,
                quantity_g=log.quantity_g,
                meal_type=log.meal_type,
            )
        )
    db.commit()
    return len(source)


# ---------------------------------------------------------------------------
# Targets / TDEE / adaptive suggestion
# ---------------------------------------------------------------------------


@router.get("/nutrition/targets/current", response_model=NutritionTargetOut | None)
def current_target(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return derive.current_target_on(db, current_user.id, date.today())


@router.get("/nutrition/targets", response_model=list[NutritionTargetOut])
def target_history(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return (
        db.query(NutritionTarget)
        .filter(NutritionTarget.user_id == current_user.id)
        .order_by(NutritionTarget.effective_date.desc())
        .all()
    )


@router.get("/nutrition/tdee-history", response_model=list[TdeeEstimateOut])
def tdee_history(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return (
        db.query(TdeeEstimate)
        .filter(TdeeEstimate.user_id == current_user.id)
        .order_by(TdeeEstimate.estimate_date)
        .all()
    )


@router.get("/nutrition/targets/suggestion", response_model=MacroSuggestionOut | None)
def current_suggestion(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return derive.compute_suggestion(db, current_user.id)


@router.post("/nutrition/targets/recompute", response_model=RecomputeResult)
def recompute(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    result = derive.compute_tdee(db, current_user.id)
    if result is None:
        return RecomputeResult(
            tdee=None,
            suggestion=None,
            message="Not enough data yet. Log weight and food for at least 7 days to get an adaptive estimate.",
        )

    today = date.today()
    db.query(TdeeEstimate).filter(
        TdeeEstimate.user_id == current_user.id, TdeeEstimate.estimate_date == today
    ).delete()
    estimate = TdeeEstimate(
        user_id=current_user.id,
        estimate_date=today,
        estimated_tdee=result["estimated_tdee"],
        weight_trend_kg=result["weight_trend_kg"],
        confidence=result["confidence"],
    )
    db.add(estimate)
    db.commit()
    db.refresh(estimate)

    return RecomputeResult(
        tdee=estimate,
        suggestion=derive.compute_suggestion(db, current_user.id),
        message=f"Recalculated from {result['days_of_data']} days of data.",
    )


@router.post("/nutrition/targets/accept", response_model=NutritionTargetOut)
def accept_suggestion(
    payload: DismissSuggestionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    suggestion = derive.compute_suggestion(db, current_user.id)
    if suggestion is None or suggestion["id"] != payload.suggestion_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That suggestion is no longer current.")

    today = date.today()
    db.query(NutritionTarget).filter(
        NutritionTarget.user_id == current_user.id, NutritionTarget.effective_date == today
    ).delete()
    target = NutritionTarget(
        user_id=current_user.id,
        effective_date=today,
        calories=suggestion["proposed"]["calories"],
        protein_g=suggestion["proposed"]["protein_g"],
        carbs_g=suggestion["proposed"]["carbs_g"],
        fat_g=suggestion["proposed"]["fat_g"],
        source="adaptive",
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.post("/nutrition/targets/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_suggestion(
    payload: DismissSuggestionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exists = (
        db.query(DismissedSuggestion)
        .filter(
            DismissedSuggestion.user_id == current_user.id,
            DismissedSuggestion.suggestion_id == payload.suggestion_id,
        )
        .first()
    )
    if exists is None:
        db.add(DismissedSuggestion(user_id=current_user.id, suggestion_id=payload.suggestion_id))
        db.commit()


@router.post("/nutrition/targets", response_model=NutritionTargetOut)
def set_manual_target(
    payload: ManualTargetPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    db.query(NutritionTarget).filter(
        NutritionTarget.user_id == current_user.id, NutritionTarget.effective_date == today
    ).delete()
    target = NutritionTarget(
        user_id=current_user.id,
        effective_date=today,
        calories=round(payload.calories),
        protein_g=round(payload.protein_g),
        carbs_g=round(payload.carbs_g),
        fat_g=round(payload.fat_g),
        source="manual",
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.get("/nutrition/targets/preview", response_model=dict)
def preview_macros(
    calories: float,
    weight_kg: float,
    goal: str,
    current_user: User = Depends(get_current_user),
):
    return macros_from_calories(calories, weight_kg, goal)  # type: ignore[arg-type]
