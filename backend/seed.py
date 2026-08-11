"""System exercise/food library seed — system design §13 (Week 1: seed library).

Run from backend/ with the venv active: python seed.py
Idempotent: re-running skips any name that's already a system (non-custom) row.
"""

from app.core.database import SessionLocal
from app.models.exercise import Exercise
from app.models.nutrition import Food

# (name, muscle_group, equipment) — ported from frontend/src/mock/exercises.ts
EXERCISE_SEEDS = [
    # Chest
    ("Barbell Bench Press", "chest", "barbell"),
    ("Incline Barbell Bench Press", "chest", "barbell"),
    ("Dumbbell Bench Press", "chest", "dumbbell"),
    ("Incline Dumbbell Press", "chest", "dumbbell"),
    ("Cable Chest Fly", "chest", "machine"),
    ("Pec Deck", "chest", "machine"),
    ("Chest Dips", "chest", "bodyweight"),
    # Back
    ("Conventional Deadlift", "back", "barbell"),
    ("Barbell Row", "back", "barbell"),
    ("Pendlay Row", "back", "barbell"),
    ("Pull-Up", "back", "bodyweight"),
    ("Chin-Up", "back", "bodyweight"),
    ("Lat Pulldown", "back", "machine"),
    ("Seated Cable Row", "back", "machine"),
    ("Single-Arm Dumbbell Row", "back", "dumbbell"),
    ("Face Pull", "back", "machine"),
    # Legs
    ("Barbell Back Squat", "legs", "barbell"),
    ("Front Squat", "legs", "barbell"),
    ("Romanian Deadlift", "legs", "barbell"),
    ("Leg Press", "legs", "machine"),
    ("Hack Squat", "legs", "machine"),
    ("Bulgarian Split Squat", "legs", "dumbbell"),
    ("Lying Leg Curl", "legs", "machine"),
    ("Leg Extension", "legs", "machine"),
    ("Walking Lunge", "legs", "dumbbell"),
    ("Standing Calf Raise", "legs", "machine"),
    # Shoulders
    ("Overhead Press", "shoulders", "barbell"),
    ("Seated Dumbbell Shoulder Press", "shoulders", "dumbbell"),
    ("Dumbbell Lateral Raise", "shoulders", "dumbbell"),
    ("Cable Lateral Raise", "shoulders", "machine"),
    ("Rear Delt Fly", "shoulders", "dumbbell"),
    # Arms
    ("Barbell Curl", "arms", "barbell"),
    ("Incline Dumbbell Curl", "arms", "dumbbell"),
    ("Hammer Curl", "arms", "dumbbell"),
    ("Preacher Curl", "arms", "machine"),
    ("EZ-Bar Skullcrusher", "arms", "barbell"),
    ("Tricep Rope Pushdown", "arms", "machine"),
    ("Overhead Cable Tricep Extension", "arms", "machine"),
    ("Close-Grip Bench Press", "arms", "barbell"),
    # Core
    ("Hanging Leg Raise", "core", "bodyweight"),
    ("Cable Crunch", "core", "machine"),
    ("Weighted Plank", "core", "bodyweight"),
    ("Ab Wheel Rollout", "core", "bodyweight"),
]

# (name, brand, kcal, protein, carbs, fat, serving_label, serving_g) per 100g —
# ported from frontend/src/mock/foods.ts
FOOD_SEEDS = [
    ("Chicken Breast, grilled", None, 165, 31, 0, 3.6, "1 breast (150 g)", 150),
    ("Chicken Thigh, skinless", None, 179, 24.8, 0, 8.2, "1 thigh (95 g)", 95),
    ("Beef Mince 5% fat", None, 137, 21.5, 0, 5, "Portion (200 g)", 200),
    ("Salmon Fillet", None, 208, 20.4, 0, 13.4, "1 fillet (130 g)", 130),
    ("Cod Fillet", None, 82, 17.8, 0, 0.7, "1 fillet (150 g)", 150),
    ("Tuna in Spring Water", "John West", 109, 25.5, 0, 0.6, "1 tin (112 g)", 112),
    ("Whole Egg", None, 143, 12.6, 0.7, 9.5, "1 large egg (58 g)", 58),
    ("Egg White", None, 52, 10.9, 0.7, 0.2, "1 white (33 g)", 33),
    ("Turkey Mince 2% fat", None, 116, 24, 0, 2, "Portion (200 g)", 200),
    ("Whey Protein Isolate", "Bulk", 373, 82, 4.5, 2.5, "1 scoop (30 g)", 30),
    ("Micellar Casein", "MyProtein", 358, 78, 4, 2, "1 scoop (30 g)", 30),
    ("Greek Yogurt 0%", "Fage", 57, 10.3, 3.6, 0.2, "Pot (170 g)", 170),
    ("Cottage Cheese", None, 98, 11.1, 3.4, 4.3, "Portion (200 g)", 200),
    ("Firm Tofu", None, 144, 15.8, 2.8, 8.7, "Block (200 g)", 200),
    ("King Prawns, cooked", None, 99, 20.9, 0.2, 1.4, "Portion (150 g)", 150),
    ("White Rice, cooked", None, 130, 2.7, 28.2, 0.3, "Portion (200 g)", 200),
    ("Basmati Rice, cooked", None, 121, 3.5, 25.2, 0.4, "Portion (200 g)", 200),
    ("Jasmine Rice, cooked", None, 129, 2.9, 28, 0.3, "Portion (200 g)", 200),
    ("Rolled Oats, dry", None, 379, 13.2, 67.7, 6.5, "Serving (80 g)", 80),
    ("Sweet Potato, baked", None, 90, 2, 20.7, 0.2, "1 medium (150 g)", 150),
    ("White Potato, boiled", None, 87, 1.9, 20.1, 0.1, "Portion (250 g)", 250),
    ("Pasta, cooked", None, 158, 5.8, 30.9, 0.9, "Portion (250 g)", 250),
    ("Sourdough Bread", None, 246, 9.8, 47.2, 1.7, "1 slice (55 g)", 55),
    ("Wholemeal Bread", "Hovis", 236, 10.5, 39.2, 2.7, "1 slice (44 g)", 44),
    ("Plain Bagel", None, 275, 11, 52, 1.6, "1 bagel (85 g)", 85),
    ("Banana", None, 89, 1.1, 22.8, 0.3, "1 medium (118 g)", 118),
    ("Apple", None, 52, 0.3, 13.8, 0.2, "1 medium (180 g)", 180),
    ("Blueberries", None, 57, 0.7, 14.5, 0.3, "Handful (80 g)", 80),
    ("Honey", None, 304, 0.3, 82.4, 0, "1 tbsp (21 g)", 21),
    ("Rice Cakes", "Kallo", 387, 8.2, 81.1, 3.1, "1 cake (8 g)", 8),
    ("Olive Oil", None, 884, 0, 0, 100, "1 tbsp (14 g)", 14),
    ("Peanut Butter, smooth", "Meridian", 606, 27, 12.5, 50, "1 tbsp (16 g)", 16),
    ("Almonds", None, 579, 21.2, 21.6, 49.9, "Handful (30 g)", 30),
    ("Avocado", None, 160, 2, 8.5, 14.7, "Half (100 g)", 100),
    ("Cheddar Cheese", None, 402, 25, 1.3, 33.1, "Slice (30 g)", 30),
    ("Dark Chocolate 85%", "Lindt", 592, 10, 19, 51, "2 squares (20 g)", 20),
    ("Broccoli, steamed", None, 35, 2.4, 7.2, 0.4, "Portion (150 g)", 150),
    ("Spinach", None, 23, 2.9, 3.6, 0.4, "Handful (50 g)", 50),
    ("Mixed Vegetables", None, 45, 2.3, 8.1, 0.4, "Portion (200 g)", 200),
    ("Semi-Skimmed Milk", None, 50, 3.6, 4.8, 1.8, "Glass (250 g)", 250),
    ("Oat Milk, barista", "Oatly", 59, 1, 6.7, 3, "Glass (250 g)", 250),
    ("Protein Bar, cookie dough", "Grenade", 388, 34, 33, 15, "1 bar (60 g)", 60),
    ("Tomato Ketchup", "Heinz", 102, 1.2, 23.2, 0.1, "1 tbsp (15 g)", 15),
]


def seed_exercises(db) -> int:
    existing = {
        name
        for (name,) in db.query(Exercise.name).filter(Exercise.is_custom.is_(False)).all()
    }
    added = 0
    for name, muscle_group, equipment in EXERCISE_SEEDS:
        if name in existing:
            continue
        db.add(Exercise(name=name, muscle_group=muscle_group, equipment=equipment, is_custom=False))
        added += 1
    return added


def seed_foods(db) -> int:
    existing = {name for (name,) in db.query(Food.name).filter(Food.is_custom.is_(False)).all()}
    added = 0
    for name, brand, kcal, protein, carbs, fat, serving_label, serving_g in FOOD_SEEDS:
        if name in existing:
            continue
        db.add(
            Food(
                name=name,
                brand=brand,
                calories_per_100g=kcal,
                protein_per_100g=protein,
                carbs_per_100g=carbs,
                fat_per_100g=fat,
                serving_label=serving_label,
                serving_g=serving_g,
                is_custom=False,
            )
        )
        added += 1
    return added


def main() -> None:
    db = SessionLocal()
    try:
        added_exercises = seed_exercises(db)
        added_foods = seed_foods(db)
        db.commit()
        print(f"Seeded {added_exercises} exercises, {added_foods} foods.")
        print(
            f"({len(EXERCISE_SEEDS) - added_exercises} exercises, "
            f"{len(FOOD_SEEDS) - added_foods} foods already present, skipped.)"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
