"""Adaptive engine — system design §7.

Mirrors frontend/src/lib/adaptive.ts one-to-one so the two never drift.
"""

from typing import Literal, TypedDict

KCAL_PER_KG = 7700
DEVIATION_THRESHOLD = 0.2

Sex = Literal["male", "female"]
ActivityLevel = Literal["sedentary", "light", "moderate", "active", "very_active"]
Goal = Literal["bulk", "cut", "maintain"]
Confidence = Literal["low", "medium", "high"]

ACTIVITY_MULTIPLIER: dict[ActivityLevel, float] = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}


class Macros(TypedDict):
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int


def mifflin_st_jeor(weight_kg: float, height_cm: float, age: int, sex: Sex, activity_level: ActivityLevel) -> int:
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    bmr = base + 5 if sex == "male" else base - 161
    return round(bmr * ACTIVITY_MULTIPLIER[activity_level])


def macros_from_calories(calories: float, weight_kg: float, goal: Goal) -> Macros:
    protein_per_kg = 2.2 if goal == "cut" else 1.9
    protein_g = round(weight_kg * protein_per_kg)
    fat_share = 0.25 if goal == "cut" else 0.27
    fat_g = round((calories * fat_share) / 9)
    remaining = calories - protein_g * 4 - fat_g * 9
    carbs_g = max(0, round(remaining / 4))
    return Macros(calories=round(calories), protein_g=protein_g, carbs_g=carbs_g, fat_g=fat_g)


def target_calories_for(tdee: float, goal_rate_kg_week: float) -> int:
    daily_delta = (goal_rate_kg_week * KCAL_PER_KG) / 7
    return round((tdee + daily_delta) / 10) * 10


def ema(values: list[float | None], alpha: float = 0.25) -> list[float | None]:
    """Exponential moving average over a daily series, gaps carried forward."""
    current: float | None = None
    out: list[float | None] = []
    for v in values:
        if v is None:
            out.append(current)
            continue
        current = v if current is None else alpha * v + (1 - alpha) * current
        out.append(current)
    return out


def linear_slope(points: list[tuple[float, float]]) -> float | None:
    """Least-squares slope of y over x -> units per x."""
    n = len(points)
    if n < 2:
        return None
    mean_x = sum(x for x, _ in points) / n
    mean_y = sum(y for _, y in points) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in points)
    den = sum((x - mean_x) ** 2 for x, _ in points)
    if den == 0:
        return None
    return num / den


def confidence_from_days(days: int) -> Confidence:
    if days < 7:
        return "low"
    if days < 14:
        return "medium"
    return "high"


class TdeeResult(TypedDict):
    estimated_tdee: int
    weight_trend_kg: float
    rate_kg_week: float
    confidence: Confidence
    days_of_data: int
    avg_daily_calories: int


def estimate_tdee(
    trend_weights: list[float | None], calories: list[float | None]
) -> TdeeResult | None:
    """Back-calculate maintenance calories from what actually happened:
    TDEE = avg daily intake - (weight change kg * 7700 / days).
    Missing days are skipped rather than treated as zero-calorie days.
    """
    logged_calories = [c for c in calories if c is not None and c > 0]
    weight_points = [(i, w) for i, w in enumerate(trend_weights) if w is not None]

    if len(logged_calories) < 3 or len(weight_points) < 3:
        return None

    avg_daily_calories = sum(logged_calories) / len(logged_calories)
    slope_per_day = linear_slope(weight_points)
    if slope_per_day is None:
        return None

    span_days = weight_points[-1][0] - weight_points[0][0]
    weight_change = slope_per_day * span_days
    days = max(span_days, 1)

    tdee = avg_daily_calories - (weight_change * KCAL_PER_KG) / days

    return TdeeResult(
        estimated_tdee=round(tdee),
        weight_trend_kg=round(weight_points[-1][1], 2),
        rate_kg_week=round(slope_per_day * 7, 3),
        confidence=confidence_from_days(min(len(logged_calories), len(weight_points))),
        days_of_data=min(len(logged_calories), len(weight_points)),
        avg_daily_calories=round(avg_daily_calories),
    )


class RetargetResult(TypedDict):
    calorie_delta: int
    deviation_pct: int
    proposed: Macros
    reason: str
    detail: str


def propose_retarget(
    actual_rate_kg_week: float,
    goal_rate_kg_week: float,
    weeks_deviating: int,
    current: Macros,
    weight_kg: float,
    goal: Goal,
) -> RetargetResult | None:
    """If the actual trend rate deviates >20% from goal for 2 consecutive weeks,
    propose a +-100-150 kcal move. Maintenance goals compare against an absolute
    band rather than a ratio."""
    deviation = (
        abs(actual_rate_kg_week) / 0.1
        if abs(goal_rate_kg_week) < 0.05
        else abs(actual_rate_kg_week - goal_rate_kg_week) / abs(goal_rate_kg_week)
    )

    if deviation <= DEVIATION_THRESHOLD or weeks_deviating < 2:
        return None

    moving_too_fast = abs(actual_rate_kg_week) > abs(goal_rate_kg_week)
    magnitude = 150 if deviation > 0.5 else 100
    direction = -1 if actual_rate_kg_week > goal_rate_kg_week else 1
    calorie_delta = magnitude * direction

    proposed = macros_from_calories(current["calories"] + calorie_delta, weight_kg, goal)

    if direction < 0:
        reason = "Losing faster than planned" if goal == "cut" else "Gaining faster than planned"
    else:
        reason = "Fat loss has stalled" if goal == "cut" else "Gaining slower than planned"

    actual_sign = "+" if actual_rate_kg_week >= 0 else "−"
    goal_sign = "+" if goal_rate_kg_week >= 0 else "−"
    detail = (
        f"Your smoothed trend is moving {actual_sign}{abs(actual_rate_kg_week):.2f} kg/week "
        f"against a {goal_sign}{abs(goal_rate_kg_week):.2f} kg/week goal "
        f"({round(deviation * 100)}% off) for {weeks_deviating} weeks. "
        f"{'Pulling' if moving_too_fast else 'Adding'} {abs(calorie_delta)} kcal keeps protein "
        f"fixed and adjusts carbs and fat."
    )

    return RetargetResult(
        calorie_delta=calorie_delta,
        deviation_pct=round(deviation * 100),
        proposed=proposed,
        reason=reason,
        detail=detail,
    )
