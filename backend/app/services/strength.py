"""Training maths — system design §7. Mirrors frontend/src/lib/strength.ts."""

from typing import Protocol, TypedDict

QUALIFYING_SET_TYPES = {"normal", "failure"}
MUSCLE_GROUPS = ["chest", "back", "legs", "shoulders", "arms", "core"]


class SetLike(Protocol):
    weight_kg: float | None
    reps: int | None
    set_type: str


def estimated_1rm(weight_kg: float | None, reps: int | None) -> float:
    """Epley: 1RM = weight * (1 + reps / 30)."""
    if not weight_kg or not reps:
        return 0.0
    return weight_kg * (1 + reps / 30)


def is_qualifying(set_: SetLike) -> bool:
    return set_.set_type in QUALIFYING_SET_TYPES


def set_volume(set_: SetLike) -> float:
    if not is_qualifying(set_):
        return 0.0
    return (set_.weight_kg or 0) * (set_.reps or 0)


def total_volume(sets: list[SetLike]) -> float:
    return sum(set_volume(s) for s in sets)


def top_set(sets: list[SetLike]):
    qualifying = [s for s in sets if is_qualifying(s)]
    if not qualifying:
        return None
    return max(qualifying, key=lambda s: estimated_1rm(s.weight_kg, s.reps))


def is_personal_record(candidate: SetLike, history: list[SetLike]) -> bool:
    if not is_qualifying(candidate) or not candidate.weight_kg or not candidate.reps:
        return False
    best_e1rm = 0.0
    best_weight = 0.0
    for s in history:
        if not is_qualifying(s):
            continue
        best_e1rm = max(best_e1rm, estimated_1rm(s.weight_kg, s.reps))
        best_weight = max(best_weight, s.weight_kg or 0)
    candidate_e1rm = estimated_1rm(candidate.weight_kg, candidate.reps)
    return candidate_e1rm > best_e1rm + 0.01 or candidate.weight_kg > best_weight + 0.01


def empty_muscle_record() -> dict[str, float]:
    return dict.fromkeys(MUSCLE_GROUPS, 0)


def volume_by_muscle_group(sets: list[SetLike], muscle_group_by_exercise: dict[str, str]) -> dict[str, float]:
    out = empty_muscle_record()
    for s in sets:
        group = muscle_group_by_exercise.get(s.exercise_id)  # type: ignore[attr-defined]
        if group is None:
            continue
        out[group] += set_volume(s)
    return out


def sets_by_muscle_group(sets: list[SetLike], muscle_group_by_exercise: dict[str, str]) -> dict[str, int]:
    out: dict[str, int] = dict.fromkeys(MUSCLE_GROUPS, 0)
    for s in sets:
        if not is_qualifying(s):
            continue
        group = muscle_group_by_exercise.get(s.exercise_id)  # type: ignore[attr-defined]
        if group is None:
            continue
        out[group] += 1
    return out


VOLUME_LANDMARKS: dict[str, dict[str, int]] = {
    "chest": {"mev": 8, "mav": 16, "mrv": 22},
    "back": {"mev": 10, "mav": 18, "mrv": 25},
    "legs": {"mev": 8, "mav": 16, "mrv": 22},
    "shoulders": {"mev": 8, "mav": 16, "mrv": 24},
    "arms": {"mev": 6, "mav": 14, "mrv": 20},
    "core": {"mev": 4, "mav": 10, "mrv": 16},
}

PLATEAU_SESSION_WINDOW = 4


class PlateauResult(TypedDict):
    is_plateaued: bool
    sessions_since_improvement: int
    best_e1rm: float
    current_e1rm: float
    last_improvement_date: str | None


def detect_plateau(points: list[dict]) -> PlateauResult:
    """points: [{"date": iso_str, "estimated_1rm": float}], any order."""
    if not points:
        return PlateauResult(
            is_plateaued=False,
            sessions_since_improvement=0,
            best_e1rm=0.0,
            current_e1rm=0.0,
            last_improvement_date=None,
        )
    ordered = sorted(points, key=lambda p: p["date"])
    best = 0.0
    last_improvement_index = -1
    last_improvement_date: str | None = None
    for i, p in enumerate(ordered):
        if p["estimated_1rm"] > best + 0.01:
            best = p["estimated_1rm"]
            last_improvement_index = i
            last_improvement_date = p["date"]
    sessions_since_improvement = len(ordered) - 1 - last_improvement_index
    return PlateauResult(
        is_plateaued=len(ordered) > PLATEAU_SESSION_WINDOW
        and sessions_since_improvement >= PLATEAU_SESSION_WINDOW,
        sessions_since_improvement=sessions_since_improvement,
        best_e1rm=best,
        current_e1rm=ordered[-1]["estimated_1rm"],
        last_improvement_date=last_improvement_date,
    )
