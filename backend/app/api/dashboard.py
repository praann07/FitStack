from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.nutrition import TdeeEstimate
from app.models.progress import BodyMetric
from app.models.routine import Routine
from app.models.user import User
from app.models.workout import WorkoutSession
from app.schemas.dashboard import DashboardSummaryOut
from app.services import derive
from app.services.dates import week_start

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummaryOut)
def summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.get(User, current_user.id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")

    today = date_type.today()
    day = derive.build_nutrition_day(db, user.id, today)
    volume = derive.build_weekly_volume(db, user.id, 2)
    this_week, last_week = volume[-1], volume[-2]

    finished = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user.id, WorkoutSession.ended_at.isnot(None))
        .order_by(WorkoutSession.session_date.desc())
        .all()
    )
    last_session = derive.build_session_summary(db, finished[0]) if finished else None

    metrics = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == user.id, BodyMetric.weight_kg.isnot(None))
        .order_by(BodyMetric.log_date.desc())
        .all()
    )
    last_weigh_in = metrics[0].log_date if metrics else None

    tdee_estimate = (
        db.query(TdeeEstimate)
        .filter(TdeeEstimate.user_id == user.id)
        .order_by(TdeeEstimate.estimate_date.desc())
        .first()
    )

    recent = list(reversed(metrics[:21]))
    trend_weight = None
    if recent:
        value = None
        for m in recent:
            value = m.weight_kg if value is None else 0.25 * m.weight_kg + 0.75 * value
        trend_weight = round(value, 2)

    return {
        "today": {
            "date": today,
            "totals": day["totals"],
            "target": day["target"],
            "logged_entries": len(day["entries"]),
        },
        "training": {
            "week_start": week_start(today),
            "sessions_this_week": this_week["sessions"],
            "planned_sessions": db.query(Routine).filter(Routine.user_id == user.id).count(),
            "volume_this_week_kg": this_week["total_volume_kg"],
            "volume_last_week_kg": last_week["total_volume_kg"],
            "sets_by_muscle_group": this_week["sets_by_muscle_group"],
            "last_session": last_session,
        },
        "body": {
            "current_trend_kg": trend_weight,
            "rate_kg_week": derive.weekly_rate(db, user.id, 21),
            "goal_rate_kg_week": user.goal_rate_kg_week,
            "goal": user.goal,
            "last_logged_date": last_weigh_in,
            "days_since_weigh_in": (today - last_weigh_in).days if last_weigh_in else None,
        },
        "tdee": tdee_estimate,
        "recent_prs": derive.build_recent_prs(db, user.id, 6),
        "plateaus": derive.build_all_plateaus(db, user.id)[:4],
        "suggestion": derive.compute_suggestion(db, user.id),
        "streak_days": derive.logging_streak(db, user.id),
    }
