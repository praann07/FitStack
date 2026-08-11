from typing import Literal

Goal = Literal["bulk", "cut", "maintain"]
MuscleGroup = Literal["chest", "back", "legs", "shoulders", "arms", "core"]
Equipment = Literal["barbell", "dumbbell", "machine", "bodyweight"]
SetType = Literal["warmup", "normal", "drop", "failure"]
MealType = Literal["breakfast", "lunch", "dinner", "snack"]
Confidence = Literal["low", "medium", "high"]
TargetSource = Literal["adaptive", "manual"]

MUSCLE_GROUPS: list[MuscleGroup] = ["chest", "back", "legs", "shoulders", "arms", "core"]
