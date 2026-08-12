"""Known-input -> expected-output tests for the adaptive engine (system design §7).

Expected values below were derived by hand from the formulas in
app/services/adaptive.py, then cross-checked against a live run of the code.
"""

from app.services.adaptive import (
    confidence_from_days,
    ema,
    estimate_tdee,
    linear_slope,
    macros_from_calories,
    mifflin_st_jeor,
    propose_retarget,
    target_calories_for,
)


def test_mifflin_st_jeor_male():
    assert mifflin_st_jeor(weight_kg=80, height_cm=180, age=25, sex="male", activity_level="sedentary") == 2166


def test_mifflin_st_jeor_female():
    assert mifflin_st_jeor(weight_kg=60, height_cm=165, age=25, sex="female", activity_level="sedentary") == 1614


def test_macros_from_calories_cut_uses_higher_protein_and_lower_fat_share():
    macros = macros_from_calories(2000, weight_kg=80, goal="cut")
    assert macros == {"calories": 2000, "protein_g": 176, "carbs_g": 198, "fat_g": 56}


def test_macros_from_calories_bulk_uses_lower_protein_and_higher_fat_share():
    macros = macros_from_calories(3000, weight_kg=90, goal="bulk")
    assert macros == {"calories": 3000, "protein_g": 171, "carbs_g": 376, "fat_g": 90}


def test_target_calories_for_cut_subtracts_deficit():
    assert target_calories_for(tdee=2500, goal_rate_kg_week=-0.5) == 1950


def test_target_calories_for_bulk_adds_surplus():
    assert target_calories_for(tdee=2500, goal_rate_kg_week=0.25) == 2780


def test_ema_carries_forward_over_gaps():
    assert ema([None, 10, None, 12, 14]) == [None, 10, 10, 10.5, 11.375]


def test_linear_slope_perfect_line():
    assert linear_slope([(0, 10), (1, 12), (2, 14)]) == 2.0


def test_linear_slope_needs_at_least_two_points():
    assert linear_slope([(0, 10)]) is None


def test_linear_slope_zero_variance_in_x_is_undefined():
    assert linear_slope([(0, 10), (0, 12)]) is None


def test_confidence_from_days_boundaries():
    assert confidence_from_days(6) == "low"
    assert confidence_from_days(7) == "medium"
    assert confidence_from_days(13) == "medium"
    assert confidence_from_days(14) == "high"


def test_estimate_tdee_back_calculates_from_trend_and_intake():
    weights = [80.0, 79.8, 79.6, 79.4, 79.2]
    calories = [2200, 2200, 2200, 2200, 2200]
    result = estimate_tdee(weights, calories)
    assert result == {
        "estimated_tdee": 3740,
        "weight_trend_kg": 79.2,
        "rate_kg_week": -1.4,
        "confidence": "low",
        "days_of_data": 5,
        "avg_daily_calories": 2200,
    }


def test_estimate_tdee_returns_none_with_fewer_than_three_weight_points():
    assert estimate_tdee([80.0, None], [2200, 2200]) is None


def test_estimate_tdee_returns_none_with_fewer_than_three_logged_calorie_days():
    weights = [80.0, 79.8, 79.6, 79.4, 79.2]
    assert estimate_tdee(weights, [2200, None, None, None, None]) is None


def test_propose_retarget_no_suggestion_below_deviation_threshold():
    current = {"calories": 2000, "protein_g": 176, "carbs_g": 198, "fat_g": 56}
    assert propose_retarget(-0.55, -0.5, weeks_deviating=2, current=current, weight_kg=80, goal="cut") is None


def test_propose_retarget_no_suggestion_before_two_consecutive_weeks():
    current = {"calories": 2000, "protein_g": 176, "carbs_g": 198, "fat_g": 56}
    assert propose_retarget(-1.0, -0.5, weeks_deviating=1, current=current, weight_kg=80, goal="cut") is None


def test_propose_retarget_cut_losing_too_fast_adds_calories():
    current = {"calories": 2000, "protein_g": 176, "carbs_g": 198, "fat_g": 56}
    result = propose_retarget(-1.0, -0.5, weeks_deviating=2, current=current, weight_kg=80, goal="cut")
    assert result["calorie_delta"] == 150
    assert result["proposed"]["calories"] == 2150
    assert result["proposed"]["protein_g"] == 176  # protein stays fixed


def test_propose_retarget_cut_losing_too_slow_cuts_calories():
    current = {"calories": 2000, "protein_g": 176, "carbs_g": 198, "fat_g": 56}
    result = propose_retarget(-0.1, -0.5, weeks_deviating=2, current=current, weight_kg=80, goal="cut")
    assert result["calorie_delta"] == -150
    assert result["proposed"]["calories"] == 1850


def test_propose_retarget_bulk_gaining_too_fast_cuts_calories():
    current = {"calories": 3000, "protein_g": 171, "carbs_g": 376, "fat_g": 90}
    result = propose_retarget(0.6, 0.25, weeks_deviating=2, current=current, weight_kg=90, goal="bulk")
    assert result["calorie_delta"] == -150
    assert result["reason"] == "Gaining faster than planned"


def test_propose_retarget_bulk_gaining_too_slow_adds_calories():
    current = {"calories": 3000, "protein_g": 171, "carbs_g": 376, "fat_g": 90}
    result = propose_retarget(0.05, 0.25, weeks_deviating=2, current=current, weight_kg=90, goal="bulk")
    assert result["calorie_delta"] == 150
    assert result["reason"] == "Gaining slower than planned"


def test_propose_retarget_maintain_uses_absolute_band_not_ratio():
    current = {"calories": 2000, "protein_g": 176, "carbs_g": 198, "fat_g": 56}
    # goal_rate ~0 -> deviation is abs(actual)/0.1, not a divide-by-near-zero ratio
    assert propose_retarget(0.01, 0.0, weeks_deviating=2, current=current, weight_kg=80, goal="maintain") is None

    result = propose_retarget(0.3, 0.0, weeks_deviating=2, current=current, weight_kg=80, goal="maintain")
    assert result["calorie_delta"] == -150
    assert result["deviation_pct"] == 300
