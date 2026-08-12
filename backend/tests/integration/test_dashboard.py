from datetime import date

from tests.conftest import auth_headers, register_user


def test_dashboard_summary_for_a_fresh_user(client):
    token, _ = register_user(client, weight_kg=80)
    res = client.get("/api/v1/dashboard/summary", headers=auth_headers(token))
    assert res.status_code == 200
    body = res.json()

    assert body["today"]["date"] == date.today().isoformat()
    assert body["today"]["logged_entries"] == 0
    assert body["today"]["target"] is not None  # seeded at registration

    assert body["training"]["sessions_this_week"] == 0
    assert body["training"]["last_session"] is None

    assert body["body"]["goal"] == "cut"
    assert body["body"]["last_logged_date"] == date.today().isoformat()

    assert body["recent_prs"] == []
    assert body["plateaus"] == []
    assert body["streak_days"] == 1  # body-metric row seeded today counts toward the streak


def test_dashboard_summary_aggregates_food_and_workout_activity(client):
    token, _ = register_user(client, weight_kg=80)

    food = client.post(
        "/api/v1/foods",
        json={"name": "Oats", "calories_per_100g": 389, "protein_per_100g": 17, "carbs_per_100g": 66, "fat_per_100g": 7},
        headers=auth_headers(token),
    ).json()
    client.post(
        "/api/v1/nutrition/logs",
        json={"food_id": food["id"], "log_date": date.today().isoformat(), "quantity_g": 100, "meal_type": "breakfast"},
        headers=auth_headers(token),
    )

    exercise = client.post(
        "/api/v1/exercises",
        json={"name": "Barbell Bench Press", "muscle_group": "chest", "equipment": "barbell"},
        headers=auth_headers(token),
    ).json()
    session = client.post("/api/v1/workouts", json={}, headers=auth_headers(token)).json()
    client.post(
        f"/api/v1/workouts/{session['id']}/sets",
        json={"exercise_id": exercise["id"], "weight_kg": 80, "reps": 5, "set_type": "normal"},
        headers=auth_headers(token),
    )
    client.patch(f"/api/v1/workouts/{session['id']}/complete", json={}, headers=auth_headers(token))

    res = client.get("/api/v1/dashboard/summary", headers=auth_headers(token))
    body = res.json()

    assert body["today"]["logged_entries"] == 1
    assert body["today"]["totals"]["calories"] == 389
    assert body["training"]["sessions_this_week"] == 1
    assert body["training"]["volume_this_week_kg"] == 400  # 80kg x 5 reps
    assert body["training"]["last_session"]["id"] == session["id"]
    assert len(body["recent_prs"]) == 1
    assert body["recent_prs"][0]["exercise_id"] == exercise["id"]
