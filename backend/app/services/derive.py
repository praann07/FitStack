"""Read-model builders — mirrors frontend/src/services/derive.ts.

Produces exactly the payloads the documented REST endpoints return
(system design §8), computed from the real DB instead of the mock store.
"""

import uuid
from datetime import date as date_type

from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.nutrition import DismissedSuggestion, Food, FoodLog, NutritionTarget
from app.models.progress import BodyMetric
from app.models.routine import Routine
from app.models.user import User
from app.models.workout import WorkoutSession, WorkoutSet
from app.services import strength
from app.services.adaptive import Macros, ema, estimate_tdee, macros_from_calories, propose_retarget
from app.services.dates import date_range, shift_date, week_start

MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"]
EMPTY_MACROS: Macros = {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}


# ---------------------------------------------------------------------------
# Workout module
# ---------------------------------------------------------------------------


def user_sessions(db: Session, user_id: uuid.UUID) -> list[WorkoutSession]:
    return (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.session_date.desc())
        .all()
    )


def session_sets(db: Session, session_id: uuid.UUID) -> list[WorkoutSet]:
    return (
        db.query(WorkoutSet)
        .filter(WorkoutSet.session_id == session_id)
        .order_by(WorkoutSet.set_number)
        .all()
    )


def user_sets(db: Session, user_id: uuid.UUID) -> list[WorkoutSet]:
    session_ids = [s.id for s in user_sessions(db, user_id)]
    if not session_ids:
        return []
    return db.query(WorkoutSet).filter(WorkoutSet.session_id.in_(session_ids)).all()


def _exercise_out(e: Exercise) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "muscle_group": e.muscle_group,
        "equipment": e.equipment,
        "is_custom": e.is_custom,
        "created_by": e.created_by,
    }


def _set_out(s: WorkoutSet) -> dict:
    return {
        "id": s.id,
        "session_id": s.session_id,
        "exercise_id": s.exercise_id,
        "set_number": s.set_number,
        "weight_kg": s.weight_kg,
        "reps": s.reps,
        "rpe": s.rpe,
        "set_type": s.set_type,
        "notes": s.notes,
        "is_pr": s.is_pr,
    }


def _session_title(routine_name: str | None, groups: list[dict]) -> str:
    if routine_name:
        return routine_name
    if not groups:
        return "Empty session"
    muscle_groups = list(dict.fromkeys(g["exercise"]["muscle_group"] for g in groups))
    return f"Freestyle — {' / '.join(muscle_groups)}"


def build_session_detail(db: Session, session: WorkoutSession) -> dict:
    sets = session_sets(db, session.id)

    order: list[uuid.UUID] = []
    by_exercise: dict[uuid.UUID, list[WorkoutSet]] = {}
    for s in sets:
        if s.exercise_id not in by_exercise:
            by_exercise[s.exercise_id] = []
            order.append(s.exercise_id)
        by_exercise[s.exercise_id].append(s)

    exercises_by_id = (
        {e.id: e for e in db.query(Exercise).filter(Exercise.id.in_(order)).all()} if order else {}
    )

    groups = []
    for exercise_id in order:
        exercise = exercises_by_id.get(exercise_id)
        if exercise is None:
            continue
        group_sets = by_exercise[exercise_id]
        top = strength.top_set(group_sets)
        groups.append(
            {
                "exercise": _exercise_out(exercise),
                "sets": [_set_out(s) for s in group_sets],
                "volume_kg": strength.total_volume(group_sets),
                "top_set": _set_out(top) if top else None,
            }
        )

    routine = db.get(Routine, session.routine_id) if session.routine_id else None
    duration = None
    if session.started_at and session.ended_at:
        duration = round((session.ended_at - session.started_at).total_seconds() / 60)

    return {
        "id": session.id,
        "user_id": session.user_id,
        "routine_id": session.routine_id,
        "session_date": session.session_date,
        "notes": session.notes,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "routine_name": routine.name if routine else None,
        "groups": groups,
        "total_volume_kg": strength.total_volume(sets),
        "total_sets": len([s for s in sets if strength.is_qualifying(s)]),
        "pr_count": len([s for s in sets if s.is_pr]),
        "duration_minutes": duration,
    }


def build_session_summary(db: Session, session: WorkoutSession) -> dict:
    detail = build_session_detail(db, session)
    return {
        "id": session.id,
        "session_date": session.session_date,
        "routine_name": detail["routine_name"],
        "title": _session_title(detail["routine_name"], detail["groups"]),
        "duration_minutes": detail["duration_minutes"],
        "total_volume_kg": detail["total_volume_kg"],
        "total_sets": detail["total_sets"],
        "pr_count": detail["pr_count"],
        "exercise_count": len(detail["groups"]),
        "muscle_groups": list(dict.fromkeys(g["exercise"]["muscle_group"] for g in detail["groups"])),
    }


def build_exercise_history(db: Session, user_id: uuid.UUID, exercise_id: uuid.UUID) -> list[dict]:
    sessions = user_sessions(db, user_id)
    points = []
    for session in sessions:
        sets = [s for s in session_sets(db, session.id) if s.exercise_id == exercise_id]
        qualifying = [s for s in sets if strength.is_qualifying(s)]
        if not qualifying:
            continue
        best = strength.top_set(qualifying)
        if best is None:
            continue
        points.append(
            {
                "session_id": session.id,
                "date": session.session_date,
                "best_weight_kg": best.weight_kg,
                "best_reps": best.reps,
                "estimated_1rm": round(strength.estimated_1rm(best.weight_kg, best.reps), 1),
                "volume_kg": sum(strength.set_volume(s) for s in qualifying),
                "is_pr": any(s.is_pr for s in qualifying),
            }
        )
    return sorted(points, key=lambda p: p["date"])


def build_plateau_status(db: Session, user_id: uuid.UUID, exercise_id: uuid.UUID) -> dict | None:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        return None
    history = build_exercise_history(db, user_id, exercise_id)
    result = strength.detect_plateau(
        [{"date": p["date"].isoformat(), "estimated_1rm": p["estimated_1rm"]} for p in history]
    )
    return {
        "exercise_id": exercise_id,
        "exercise_name": exercise.name,
        "is_plateaued": result["is_plateaued"],
        "sessions_analysed": len(history),
        "sessions_since_improvement": result["sessions_since_improvement"],
        "best_estimated_1rm": round(result["best_e1rm"], 1),
        "current_estimated_1rm": round(result["current_e1rm"], 1),
        "last_improvement_date": date_type.fromisoformat(result["last_improvement_date"])
        if result["last_improvement_date"]
        else None,
    }


def build_all_plateaus(db: Session, user_id: uuid.UUID) -> list[dict]:
    trained = {s.exercise_id for s in user_sets(db, user_id) if strength.is_qualifying(s)}
    statuses = []
    for exercise_id in trained:
        status = build_plateau_status(db, user_id, exercise_id)
        if status and status["is_plateaued"]:
            statuses.append(status)
    return sorted(statuses, key=lambda s: s["sessions_since_improvement"], reverse=True)


def build_weekly_volume(db: Session, user_id: uuid.UUID, weeks: int) -> list[dict]:
    muscle_group_by_exercise = {e.id: e.muscle_group for e in db.query(Exercise).all()}
    sessions = user_sessions(db, user_id)
    current_week = week_start(date_type.today())

    buckets: dict[date_type, list[WorkoutSet]] = {}
    session_count: dict[date_type, int] = {}
    for i in range(weeks - 1, -1, -1):
        buckets[shift_date(current_week, -i * 7)] = []

    for session in sessions:
        bucket = week_start(session.session_date)
        if bucket not in buckets:
            continue
        buckets[bucket].extend(session_sets(db, session.id))
        session_count[bucket] = session_count.get(bucket, 0) + 1

    out = []
    for wk, sets in buckets.items():
        out.append(
            {
                "week_start": wk,
                "label": f"{wk.day} {wk.strftime('%b')}",
                "total_volume_kg": strength.total_volume(sets),
                "by_muscle_group": strength.volume_by_muscle_group(sets, muscle_group_by_exercise),
                "sets_by_muscle_group": strength.sets_by_muscle_group(sets, muscle_group_by_exercise),
                "sessions": session_count.get(wk, 0),
            }
        )
    return out


def recompute_prs(db: Session, user_id: uuid.UUID) -> None:
    """Chronological PR pass over every set the user has logged: a set is a PR
    when it beats the best estimated 1RM (or matches the best weight with more
    reps) seen so far for that exercise. Mutates .is_pr in place; caller commits.
    """
    sessions = user_sessions(db, user_id)
    date_by_session = {s.id: s.session_date for s in sessions}
    sets = user_sets(db, user_id)
    ordered = sorted(sets, key=lambda s: (date_by_session.get(s.session_id), s.set_number))

    best: dict[uuid.UUID, dict[str, float]] = {}
    for s in ordered:
        if not strength.is_qualifying(s) or not s.weight_kg or not s.reps:
            s.is_pr = False
            continue
        current = best.get(s.exercise_id, {"e1rm": 0.0, "weight": 0.0})
        e1rm = strength.estimated_1rm(s.weight_kg, s.reps)
        is_pr = e1rm > current["e1rm"] + 0.01 or s.weight_kg > current["weight"] + 0.01
        s.is_pr = is_pr
        if is_pr:
            best[s.exercise_id] = {
                "e1rm": max(current["e1rm"], e1rm),
                "weight": max(current["weight"], s.weight_kg),
            }


def build_recent_prs(db: Session, user_id: uuid.UUID, limit: int = 8) -> list[dict]:
    sessions_by_id = {s.id: s for s in user_sessions(db, user_id)}
    if not sessions_by_id:
        return []
    exercises_by_id = {e.id: e for e in db.query(Exercise).all()}
    pr_sets = (
        db.query(WorkoutSet)
        .filter(WorkoutSet.session_id.in_(list(sessions_by_id.keys())), WorkoutSet.is_pr.is_(True))
        .all()
    )
    out = []
    for s in pr_sets:
        exercise = exercises_by_id.get(s.exercise_id)
        session = sessions_by_id.get(s.session_id)
        if exercise is None or session is None:
            continue
        out.append(
            {
                "set_id": s.id,
                "session_id": s.session_id,
                "date": session.session_date,
                "exercise_id": exercise.id,
                "exercise_name": exercise.name,
                "muscle_group": exercise.muscle_group,
                "weight_kg": s.weight_kg,
                "reps": s.reps,
                "estimated_1rm": round(strength.estimated_1rm(s.weight_kg, s.reps), 1),
            }
        )
    out.sort(key=lambda p: (p["date"], p["estimated_1rm"]), reverse=True)
    return out[:limit]


# ---------------------------------------------------------------------------
# Nutrition module
# ---------------------------------------------------------------------------


def macros_for(food: Food, quantity_g: float) -> Macros:
    ratio = quantity_g / 100
    return Macros(
        calories=round((food.calories_per_100g or 0) * ratio, 1),
        protein_g=round((food.protein_per_100g or 0) * ratio, 1),
        carbs_g=round((food.carbs_per_100g or 0) * ratio, 1),
        fat_g=round((food.fat_per_100g or 0) * ratio, 1),
    )


def sum_macros(macros_list: list[Macros]) -> Macros:
    out = dict(EMPTY_MACROS)
    for m in macros_list:
        out["calories"] += m["calories"]
        out["protein_g"] += m["protein_g"]
        out["carbs_g"] += m["carbs_g"]
        out["fat_g"] += m["fat_g"]
    return out  # type: ignore[return-value]


def current_target_on(db: Session, user_id: uuid.UUID, on_date: date_type) -> NutritionTarget | None:
    return (
        db.query(NutritionTarget)
        .filter(NutritionTarget.user_id == user_id, NutritionTarget.effective_date <= on_date)
        .order_by(NutritionTarget.effective_date.desc())
        .first()
    )


def build_nutrition_day(db: Session, user_id: uuid.UUID, on_date: date_type) -> dict:
    logs = (
        db.query(FoodLog)
        .filter(FoodLog.user_id == user_id, FoodLog.log_date == on_date)
        .all()
    )
    food_ids = {log.food_id for log in logs}
    foods_by_id = {f.id: f for f in db.query(Food).filter(Food.id.in_(food_ids)).all()} if food_ids else {}

    entries = []
    for log in logs:
        food = foods_by_id.get(log.food_id)
        if food is None:
            continue
        entries.append(
            {
                "id": log.id,
                "user_id": log.user_id,
                "food_id": log.food_id,
                "log_date": log.log_date,
                "quantity_g": log.quantity_g,
                "meal_type": log.meal_type,
                "food": {
                    "id": food.id,
                    "name": food.name,
                    "brand": food.brand,
                    "calories_per_100g": food.calories_per_100g,
                    "protein_per_100g": food.protein_per_100g,
                    "carbs_per_100g": food.carbs_per_100g,
                    "fat_per_100g": food.fat_per_100g,
                    "serving_label": food.serving_label,
                    "serving_g": food.serving_g,
                    "is_custom": food.is_custom,
                    "created_by": food.created_by,
                },
                "macros": macros_for(food, log.quantity_g),
            }
        )

    by_meal = {}
    for meal in MEAL_TYPES:
        meal_entries = [e for e in entries if e["meal_type"] == meal]
        by_meal[meal] = {
            "entries": meal_entries,
            "totals": sum_macros([e["macros"] for e in meal_entries]),
        }

    return {
        "date": on_date,
        "entries": entries,
        "totals": sum_macros([e["macros"] for e in entries]),
        "target": current_target_on(db, user_id, on_date),
        "by_meal": by_meal,
    }


def calories_by_date(db: Session, user_id: uuid.UUID) -> dict[date_type, float]:
    logs = db.query(FoodLog).filter(FoodLog.user_id == user_id).all()
    food_ids = {log.food_id for log in logs}
    foods_by_id = {f.id: f for f in db.query(Food).filter(Food.id.in_(food_ids)).all()} if food_ids else {}
    out: dict[date_type, float] = {}
    for log in logs:
        food = foods_by_id.get(log.food_id)
        if food is None:
            continue
        out[log.log_date] = out.get(log.log_date, 0) + (food.calories_per_100g or 0) * log.quantity_g / 100
    return out


# ---------------------------------------------------------------------------
# Progress / trend
# ---------------------------------------------------------------------------


def _weight_by_date(db: Session, user_id: uuid.UUID) -> dict[date_type, float]:
    metrics = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == user_id, BodyMetric.weight_kg.isnot(None))
        .all()
    )
    return {m.log_date: m.weight_kg for m in metrics}


def weekly_rate(
    db: Session, user_id: uuid.UUID, days: int, end_date: date_type | None = None
) -> float | None:
    end_date = end_date or date_type.today()
    start = shift_date(end_date, -(days - 1))
    dates = date_range(shift_date(start, -14), end_date)
    weight_by_date = _weight_by_date(db, user_id)
    smoothed = ema([weight_by_date.get(d) for d in dates])
    series = [
        (d, v) for d, v in zip(dates, smoothed, strict=True) if d >= start and v is not None
    ]
    if len(series) < 4:
        return None
    span_days = (series[-1][0] - series[0][0]).days
    if span_days <= 0:
        return None
    return round(((series[-1][1] - series[0][1]) / span_days) * 7, 3)


def build_trend(db: Session, user_id: uuid.UUID, days: int, end_date: date_type | None = None) -> dict:
    end = end_date or date_type.today()
    start = shift_date(end, -(days - 1))
    dates = date_range(start, end)

    weight_by_date = _weight_by_date(db, user_id)
    calories = calories_by_date(db, user_id)

    volume_by_date: dict[date_type, float] = {}
    for session in user_sessions(db, user_id):
        volume_by_date[session.session_date] = volume_by_date.get(
            session.session_date, 0
        ) + strength.total_volume(session_sets(db, session.id))

    warmup_dates = date_range(shift_date(start, -14), shift_date(start, -1))
    raw_all = [weight_by_date.get(d) for d in warmup_dates + dates]
    smoothed_all = ema(raw_all)
    smoothed = smoothed_all[len(warmup_dates):]

    points = []
    for i, d in enumerate(dates):
        points.append(
            {
                "date": d,
                "weight_kg": weight_by_date.get(d),
                "trend_kg": round(smoothed[i], 2) if smoothed[i] is not None else None,
                "calories": round(calories[d]) if d in calories else None,
                "volume_kg": volume_by_date.get(d),
            }
        )

    known = [p for p in points if p["trend_kg"] is not None]
    first = known[0]["trend_kg"] if known else None
    last = known[-1]["trend_kg"] if known else None

    rate = weekly_rate(db, user_id, 21, end)

    weekly_volume = [
        {"week_start": w["week_start"], "volume_kg": w["total_volume_kg"]}
        for w in build_weekly_volume(db, user_id, max(4, -(-days // 7)))
    ]

    return {
        "points": points,
        "current_trend_kg": last,
        "rate_kg_week": rate,
        "total_change_kg": round(last - first, 2) if first is not None and last is not None else None,
        "weekly_volume": weekly_volume,
    }


def compute_tdee(db: Session, user_id: uuid.UUID, end_date: date_type | None = None):
    end_date = end_date or date_type.today()
    dates = date_range(shift_date(end_date, -21), shift_date(end_date, -1))
    weight_by_date = _weight_by_date(db, user_id)
    calories = calories_by_date(db, user_id)
    smoothed = ema([weight_by_date.get(d) for d in dates])
    return estimate_tdee(
        trend_weights=smoothed,
        calories=[round(calories[d]) if d in calories else None for d in dates],
    )


def compute_suggestion(db: Session, user_id: uuid.UUID) -> dict | None:
    user = db.get(User, user_id)
    if user is None:
        return None
    today = date_type.today()
    target = current_target_on(db, user_id, today)
    if target is None:
        return None

    recent_rate = weekly_rate(db, user_id, 14)
    if recent_rate is None:
        return None
    prior_rate = weekly_rate(db, user_id, 14, shift_date(today, -7))

    def deviates(rate: float | None) -> bool:
        if rate is None:
            return False
        dev = (
            abs(rate) / 0.1
            if abs(user.goal_rate_kg_week) < 0.05
            else abs(rate - user.goal_rate_kg_week) / abs(user.goal_rate_kg_week)
        )
        return dev > 0.2

    weeks_deviating = int(deviates(recent_rate)) + int(deviates(prior_rate))

    trend = build_trend(db, user_id, 21)
    weight = trend["current_trend_kg"] or 0
    current: Macros = {
        "calories": target.calories,
        "protein_g": target.protein_g,
        "carbs_g": target.carbs_g,
        "fat_g": target.fat_g,
    }

    result = propose_retarget(
        actual_rate_kg_week=recent_rate,
        goal_rate_kg_week=user.goal_rate_kg_week,
        weeks_deviating=weeks_deviating,
        current=current,
        weight_kg=weight,
        goal=user.goal,
    )
    if result is None:
        return None

    suggestion_id = f"sug-{target.id}-{week_start(today).isoformat()}"
    is_dismissed = (
        db.query(DismissedSuggestion)
        .filter(
            DismissedSuggestion.user_id == user_id,
            DismissedSuggestion.suggestion_id == suggestion_id,
        )
        .first()
        is not None
    )
    if is_dismissed:
        return None

    return {
        "id": suggestion_id,
        "created_date": week_start(today),
        "calorie_delta": result["calorie_delta"],
        "reason": result["reason"],
        "detail": result["detail"],
        "actual_rate_kg_week": recent_rate,
        "goal_rate_kg_week": user.goal_rate_kg_week,
        "deviation_pct": result["deviation_pct"],
        "weeks_deviating": weeks_deviating,
        "proposed": result["proposed"],
        "current": current,
    }


def logging_streak(db: Session, user_id: uuid.UUID) -> int:
    logged: set[date_type] = set()
    for log in db.query(FoodLog.log_date).filter(FoodLog.user_id == user_id).all():
        logged.add(log[0])
    for s in db.query(WorkoutSession.session_date).filter(WorkoutSession.user_id == user_id).all():
        logged.add(s[0])
    for m in db.query(BodyMetric.log_date).filter(BodyMetric.user_id == user_id).all():
        logged.add(m[0])

    streak = 0
    cursor = date_type.today()
    if cursor not in logged:
        cursor = shift_date(cursor, -1)
    while cursor in logged:
        streak += 1
        cursor = shift_date(cursor, -1)
    return streak
