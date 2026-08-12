"""Known-input -> expected-output tests for the strength/PR/plateau math (system design §7)."""

from dataclasses import dataclass

from app.services.strength import (
    detect_plateau,
    estimated_1rm,
    is_personal_record,
    is_qualifying,
    set_volume,
    sets_by_muscle_group,
    top_set,
    total_volume,
    volume_by_muscle_group,
)


@dataclass
class FakeSet:
    weight_kg: float | None
    reps: int | None
    set_type: str = "normal"
    exercise_id: str = "ex1"


def test_estimated_1rm_epley_formula():
    assert estimated_1rm(100, 5) == 100 * (1 + 5 / 30)


def test_estimated_1rm_zero_without_weight_or_reps():
    assert estimated_1rm(None, 5) == 0.0
    assert estimated_1rm(100, None) == 0.0
    assert estimated_1rm(0, 5) == 0.0


def test_is_qualifying_excludes_warmup_and_drop_sets():
    assert is_qualifying(FakeSet(100, 5, "normal")) is True
    assert is_qualifying(FakeSet(100, 5, "failure")) is True
    assert is_qualifying(FakeSet(100, 5, "warmup")) is False
    assert is_qualifying(FakeSet(100, 5, "drop")) is False


def test_set_volume_and_total_volume_only_count_qualifying_sets():
    sets = [
        FakeSet(100, 5, "warmup"),  # excluded
        FakeSet(100, 5, "normal"),  # 500
        FakeSet(110, 3, "normal"),  # 330
        FakeSet(90, 8, "drop"),  # excluded
    ]
    assert set_volume(sets[0]) == 0.0
    assert set_volume(sets[1]) == 500
    assert total_volume(sets) == 830.0


def test_top_set_picks_highest_estimated_1rm_not_raw_weight():
    sets = [FakeSet(100, 5, "normal"), FakeSet(110, 3, "normal"), FakeSet(90, 8, "drop")]
    top = top_set(sets)
    assert (top.weight_kg, top.reps) == (110, 3)


def test_top_set_none_when_nothing_qualifies():
    assert top_set([FakeSet(100, 5, "warmup")]) is None


def test_is_personal_record_beats_prior_best_estimated_1rm():
    history = [FakeSet(100, 5, "normal"), FakeSet(95, 8, "normal")]
    assert is_personal_record(FakeSet(105, 5, "normal"), history) is True


def test_is_personal_record_false_when_not_an_improvement():
    history = [FakeSet(100, 5, "normal"), FakeSet(95, 8, "normal")]
    assert is_personal_record(FakeSet(90, 10, "normal"), history) is False


def test_is_personal_record_false_for_non_qualifying_candidate():
    history = [FakeSet(100, 5, "normal")]
    assert is_personal_record(FakeSet(200, 10, "warmup"), history) is False


def test_is_personal_record_true_on_raw_weight_pr_even_with_lower_e1rm():
    history = [FakeSet(100, 5, "normal"), FakeSet(95, 8, "normal")]
    assert is_personal_record(FakeSet(101, 1, "normal"), history) is True


def test_volume_and_sets_by_muscle_group_map_through_exercise_lookup():
    sets = [
        FakeSet(100, 5, "normal", exercise_id="bench"),
        FakeSet(100, 5, "warmup", exercise_id="bench"),
        FakeSet(80, 8, "normal", exercise_id="squat"),
    ]
    groups = {"bench": "chest", "squat": "legs"}
    volume = volume_by_muscle_group(sets, groups)
    assert volume["chest"] == 500.0
    assert volume["legs"] == 640
    assert volume["back"] == 0

    counts = sets_by_muscle_group(sets, groups)
    assert counts == {"chest": 1, "back": 0, "legs": 1, "shoulders": 0, "arms": 0, "core": 0}


def _points(values: list[float]) -> list[dict]:
    return [{"date": f"2026-01-{i + 1:02d}", "estimated_1rm": v} for i, v in enumerate(values)]


def test_detect_plateau_empty_history():
    result = detect_plateau([])
    assert result["is_plateaued"] is False
    assert result["last_improvement_date"] is None


def test_detect_plateau_false_under_the_session_window():
    result = detect_plateau(_points([100, 105, 110, 110]))
    assert result["is_plateaued"] is False


def test_detect_plateau_true_after_four_stagnant_sessions_since_the_last_pr():
    result = detect_plateau(_points([100, 105, 110, 110, 110, 110, 110]))
    assert result["is_plateaued"] is True
    assert result["sessions_since_improvement"] == 4
    assert result["best_e1rm"] == 110


def test_detect_plateau_false_when_still_improving():
    result = detect_plateau(_points([100, 105, 110, 108, 115]))
    assert result["is_plateaued"] is False
    assert result["current_e1rm"] == 115
